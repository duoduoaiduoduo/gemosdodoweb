import express from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import crypto from 'crypto';
import {spawnSync} from 'child_process';
import http from 'http';
import dotenv from 'dotenv';
import multer from 'multer';
import IP2RegionModule from 'ip2region';
import {WebSocket, WebSocketServer} from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IP2Region = IP2RegionModule?.default || IP2RegionModule;

// Load env files for local development (priority: .env.local > .env)
dotenv.config({path: path.join(__dirname, '.env')});
dotenv.config({path: path.join(__dirname, '.env.local'), override: true});

const FALLBACK_ADMIN_SECRET = 'Qq13209985101';
const RESOLVED_ADMIN_SECRET = (process.env.ADMIN_SECRET || '').trim() || FALLBACK_ADMIN_SECRET;
const ALLOWED_COVER_ASPECTS = new Set(['3:4', '4:3', '1:1', '16:9', '9:16']);
const ALLOWED_TIMELINE_CATEGORIES = new Set(['project', 'video', 'edu']);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 0);
// JSON body limit (admin uploads send images/PDFs as base64; ~4/3 of raw bytes + JSON overhead).
// A ~200MB PDF needs ~270MB+ here; default 400 avoids "Failed to fetch" when limit is too low.
const maxRequestMb = Number(process.env.MAX_REQUEST_MB || 400);

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1) || 1);
app.use(express.json({limit: `${Math.max(50, maxRequestMb)}mb`}));

const visitorStatsFile = path.join(__dirname, 'visitor_stats.json');
const UNKNOWN_REGION_LABEL = 'Unknown';
const defaultIp2RegionIpv4Db = path.join(__dirname, 'node_modules', 'ip2region', 'data', 'ip2region.db');
const defaultIp2RegionIpv6Db = path.join(__dirname, 'node_modules', 'ip2region', 'data', 'ipv6wry.db');
const resolveDbPath = (value, fallback) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return path.isAbsolute(raw) ? raw : path.join(__dirname, raw);
};
const ip2RegionIpv4Db = resolveDbPath(process.env.IP2REGION_IPV4_DB, defaultIp2RegionIpv4Db);
const ip2RegionIpv6Db = resolveDbPath(process.env.IP2REGION_IPV6_DB, defaultIp2RegionIpv6Db);
const ip2RegionDisableIpv6 = /^(1|true|yes)$/i.test(String(process.env.IP2REGION_DISABLE_IPV6 || '').trim());
let ip2RegionSearcher = null;

try {
  if (!fs.existsSync(ip2RegionIpv4Db)) {
    console.warn(`[IP2REGION] IPv4 DB not found: ${ip2RegionIpv4Db}`);
  } else if (!ip2RegionDisableIpv6 && !fs.existsSync(ip2RegionIpv6Db)) {
    console.warn(`[IP2REGION] IPv6 DB not found: ${ip2RegionIpv6Db}. IPv6 lookup disabled.`);
    ip2RegionSearcher = new IP2Region({
      ipv4db: ip2RegionIpv4Db,
      disableIpv6: true,
    });
  } else {
    ip2RegionSearcher = new IP2Region({
      ipv4db: ip2RegionIpv4Db,
      ipv6db: ip2RegionIpv6Db,
      disableIpv6: ip2RegionDisableIpv6,
    });
  }
} catch (err) {
  ip2RegionSearcher = null;
  console.error('[IP2REGION_INIT]', err);
}

const formatLocalDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const getLocalDateKey = () => formatLocalDateKey(new Date());

const sanitizeVisitText = (value, maxLen = 120) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLen);
};

const normalizeIpAddress = (value) => {
  let ip = sanitizeVisitText(value, 140);
  if (!ip) return '';
  ip = ip.replace(/^"|"$/g, '');
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.slice(1, ip.indexOf(']'));
  }
  const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort) ip = ipv4WithPort[1];
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) ip = mapped;
  }
  const zoneIndex = ip.indexOf('%');
  if (zoneIndex > 0) ip = ip.slice(0, zoneIndex);
  return sanitizeVisitText(ip, 80);
};

const isValidIpv4 = (ip) => {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
  return ip.split('.').every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
};

const isPrivateOrLocalIp = (ip) => {
  if (!ip || ip === 'unknown') return true;
  if (ip === '::1' || ip === '::') return true;
  if (/^(fc|fd|fe80):/i.test(ip)) return true;
  if (isValidIpv4(ip)) {
    const [a, b] = ip.split('.').map((part) => Number(part));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
};

const sanitizeRegionPart = (value) => {
  const raw = sanitizeVisitText(value, 72);
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (
    normalized === '0' ||
    normalized === '-' ||
    normalized === 'null' ||
    normalized === 'none' ||
    normalized === 'unknown' ||
    normalized === 'n/a' ||
    normalized === 'na'
  ) {
    return '';
  }
  if (raw.includes('内网') || raw.includes('局域网')) return '';
  if (normalized === 'localhost' || normalized === 'local') return '';
  return raw;
};

const stripCnDivisionSuffix = (value) => {
  const raw = sanitizeRegionPart(value);
  if (!raw) return '';
  return raw
    .replace(/特别行政区$/u, '')
    .replace(/壮族自治区$/u, '')
    .replace(/回族自治区$/u, '')
    .replace(/维吾尔自治区$/u, '')
    .replace(/自治区$/u, '')
    .replace(/省$/u, '')
    .replace(/市$/u, '')
    .trim();
};

const isChinaCountry = (country) => {
  const raw = sanitizeRegionPart(country);
  if (!raw) return false;
  return raw.includes('中国') || /^china$/i.test(raw);
};

const buildRegionDisplayLabel = ({country, province, city, explicitLabel} = {}) => {
  const safeCountry = sanitizeRegionPart(country);
  const safeProvince = sanitizeRegionPart(province);
  const safeCity = sanitizeRegionPart(city);
  const safeExplicit = sanitizeRegionPart(explicitLabel);

  if (isChinaCountry(safeCountry)) {
    const provinceName = stripCnDivisionSuffix(safeProvince) || stripCnDivisionSuffix(safeCity);
    if (provinceName) return `中国 ${provinceName}`;
    return '中国';
  }

  if (safeCity) return safeCity;
  if (safeProvince) return safeProvince;
  if (safeCountry) return safeCountry;
  if (safeExplicit) return safeExplicit;
  return UNKNOWN_REGION_LABEL;
};

const normalizeRegionMeta = (meta) => {
  const country = sanitizeRegionPart(meta?.country || '');
  const province = sanitizeRegionPart(meta?.province || '');
  const city = sanitizeRegionPart(meta?.city || '');
  const explicitLabel = sanitizeRegionPart(meta?.regionLabel || '');
  const regionLabel = buildRegionDisplayLabel({country, province, city, explicitLabel});
  return {
    country,
    province,
    city,
    regionLabel,
  };
};

const resolveRegionByIp = (ip) => {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp || isPrivateOrLocalIp(normalizedIp)) return normalizeRegionMeta(null);
  if (!ip2RegionSearcher) return normalizeRegionMeta(null);
  try {
    const result = ip2RegionSearcher.search(normalizedIp) || {};
    let country = sanitizeRegionPart(result?.country || '');
    let province = sanitizeRegionPart(result?.province || '');
    let city = sanitizeRegionPart(result?.city || '');

    if (!province && !city) {
      const rawResult = ip2RegionSearcher.searchRaw(normalizedIp, false);
      const rawRegion = sanitizeVisitText(rawResult?.region || rawResult?.cArea || '', 240);
      if (rawRegion && rawRegion.includes('|')) {
        const parts = rawRegion.split('|').map((part) => sanitizeRegionPart(part));
        if (!country) country = parts[0] || country;
        if (!province) province = parts[1] || province;
        if (!city) city = parts[2] || city;
      }
    }

    return normalizeRegionMeta({
      country,
      province,
      city,
    });
  } catch {
    return normalizeRegionMeta(null);
  }
};

const normalizeHost = (value) => sanitizeVisitText(value, 120).toLowerCase().replace(/^www\./, '');

const extractHostFromUrl = (value) => {
  const raw = sanitizeVisitText(value, 260);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return normalizeHost(parsed.hostname || '');
  } catch {
    return normalizeHost(raw);
  }
};

const sanitizeSourceKey = (value) => {
  const raw = sanitizeVisitText(value, 120).toLowerCase();
  const normalized = raw.replace(/[^a-z0-9._:-]/g, '');
  return normalized || '';
};

const normalizeLandingPath = (value) => {
  const raw = sanitizeVisitText(value || '/', 220);
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const normalizeVisitMeta = (meta, requestHost = '') => {
  const normalizedRequestHost = normalizeHost(requestHost);
  const utmSource = sanitizeVisitText(meta?.utmSource || '', 64).toLowerCase();
  const utmMedium = sanitizeVisitText(meta?.utmMedium || '', 64).toLowerCase();
  const utmCampaign = sanitizeVisitText(meta?.utmCampaign || '', 96);
  const referrerHost = extractHostFromUrl(meta?.referrerHost || '');
  const explicitSource = sanitizeSourceKey(meta?.source || '');
  const safeUtmSource = sanitizeSourceKey(utmSource);
  const safeReferrerHost = sanitizeSourceKey(referrerHost);

  let source = explicitSource;
  if (!source && safeUtmSource) source = `utm:${safeUtmSource}`;
  if (!source && safeReferrerHost) {
    source = safeReferrerHost === normalizedRequestHost ? 'internal' : `ref:${safeReferrerHost}`;
  }
  if (!source) source = 'direct';
  const regionMeta = normalizeRegionMeta(meta);

  return {
    source,
    referrerHost: referrerHost || '',
    landingPath: normalizeLandingPath(meta?.landingPath || '/'),
    utmSource,
    utmMedium,
    utmCampaign,
    country: regionMeta.country,
    province: regionMeta.province,
    city: regionMeta.city,
    regionLabel: regionMeta.regionLabel,
  };
};

const normalizeVisitorBucket = (bucket) => {
  const rawIps = bucket && Array.isArray(bucket.ips) ? bucket.ips : [];
  const sourceByIpRaw =
    bucket && bucket.sourceByIp && typeof bucket.sourceByIp === 'object' ? bucket.sourceByIp : {};
  const ipSet = new Set();
  const ips = [];
  const sourceByIp = {};

  for (const rawIp of rawIps) {
    const ip = normalizeIpAddress(rawIp) || sanitizeVisitText(rawIp, 80);
    if (!ip || ipSet.has(ip)) continue;
    ipSet.add(ip);
    ips.push(ip);
  }

  for (const [rawIp, rawMeta] of Object.entries(sourceByIpRaw)) {
    const ip = normalizeIpAddress(rawIp) || sanitizeVisitText(rawIp, 80);
    if (!ip || ipSet.has(ip)) continue;
    ipSet.add(ip);
    ips.push(ip);
    sourceByIp[ip] = normalizeVisitMeta(rawMeta);
  }

  for (const ip of ips) {
    if (!sourceByIp[ip]) {
      sourceByIp[ip] = normalizeVisitMeta(sourceByIpRaw[ip] || {source: 'unknown'});
    }
  }

  return {ips, sourceByIp};
};

const getVisitMetaFromRequest = (req) => {
  const query = req.query || {};
  return normalizeVisitMeta(
    {
      source: query.source,
      referrerHost: query.referrerHost || query.ref || req.headers.referer || req.headers.referrer,
      landingPath: query.path || query.landingPath,
      utmSource: query.utm_source || query.utmSource,
      utmMedium: query.utm_medium || query.utmMedium,
      utmCampaign: query.utm_campaign || query.utmCampaign,
    },
    req.headers.host,
  );
};

const formatSourceLabel = (sourceKey) => {
  const key = sanitizeSourceKey(sourceKey || '');
  if (!key || key === 'unknown') return 'Direct';
  if (key === 'direct') return 'Direct';
  if (key === 'internal') return 'Internal';
  if (key.startsWith('utm:')) return `UTM:${key.slice(4) || 'unknown'}`;
  if (key.startsWith('ref:')) return key.slice(4) || 'referrer';
  return key;
};

const getSourceQuality = (sourceKey) => {
  const key = sanitizeSourceKey(sourceKey || '');
  if (!key || key === 'unknown') return 0;
  if (key === 'internal') return 1;
  if (key === 'direct') return 2;
  if (key.startsWith('utm:') || key.startsWith('ref:')) return 3;
  return 2;
};

const formatRegionLabel = (meta) => {
  const normalized = normalizeRegionMeta(meta);
  return normalized.regionLabel || UNKNOWN_REGION_LABEL;
};

const summarizeSourceTop = (bucket, limit = 10) => {
  const normalized = normalizeVisitorBucket(bucket);
  const counter = new Map();
  const total = normalized.ips.length;
  for (const ip of normalized.ips) {
    const rawSource = sanitizeSourceKey(normalized.sourceByIp[ip]?.source || 'unknown') || 'unknown';
    const source = rawSource === 'unknown' ? 'direct' : rawSource;
    counter.set(source, (counter.get(source) || 0) + 1);
  }
  return [...counter.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, Math.max(1, limit))
    .map(([key, count]) => ({
      key,
      label: formatSourceLabel(key),
      count,
      ratio: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
    }));
};

const summarizeRegionTop = (bucket, limit = 10) => {
  const normalized = normalizeVisitorBucket(bucket);
  const counter = new Map();
  const total = normalized.ips.length;
  for (const ip of normalized.ips) {
    const regionLabel = formatRegionLabel(normalized.sourceByIp[ip]);
    counter.set(regionLabel, (counter.get(regionLabel) || 0) + 1);
  }
  return [...counter.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, Math.max(1, limit))
    .map(([label, count]) => ({
      key: `region:${encodeURIComponent(label)}`,
      label,
      count,
      ratio: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
    }));
};

const readVisitorStatsRaw = () => {
  try {
    if (!fs.existsSync(visitorStatsFile)) return {};
    const raw = fs.readFileSync(visitorStatsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const trimVisitorStats = (obj) => {
  const keys = Object.keys(obj).sort();
  const maxDays = 400;
  if (keys.length <= maxDays) return obj;
  const drop = keys.length - maxDays;
  const next = {...obj};
  for (let i = 0; i < drop; i++) delete next[keys[i]];
  return next;
};

const writeVisitorStatsRaw = (obj) => {
  fs.writeFileSync(visitorStatsFile, JSON.stringify(obj), 'utf8');
};

const recordVisitForIp = (ip, visitMeta) => {
  const day = getLocalDateKey();
  const normalized = normalizeIpAddress(ip || 'unknown') || 'unknown';
  const normalizedMeta = normalizeVisitMeta({
    ...(visitMeta || {}),
    ...resolveRegionByIp(normalized),
  });
  let data = readVisitorStatsRaw();
  const bucket = normalizeVisitorBucket(data[day]);
  const existingMeta = bucket.sourceByIp[normalized];
  if (bucket.ips.includes(normalized)) {
    const existingRegion = normalizeRegionMeta(existingMeta);
    const nextRegion = normalizeRegionMeta(normalizedMeta);
    const hasRegionFields =
      !!existingMeta &&
      typeof existingMeta === 'object' &&
      typeof existingMeta.country === 'string' &&
      typeof existingMeta.province === 'string' &&
      typeof existingMeta.city === 'string' &&
      typeof existingMeta.regionLabel === 'string';
    const shouldUpdateSource =
      !existingMeta ||
      getSourceQuality(normalizedMeta.source) > getSourceQuality(existingMeta?.source || 'unknown');
    const shouldUpdateRegion =
      !hasRegionFields ||
      (existingRegion.regionLabel === UNKNOWN_REGION_LABEL && nextRegion.regionLabel !== UNKNOWN_REGION_LABEL);
    if (shouldUpdateSource || shouldUpdateRegion) {
      bucket.sourceByIp[normalized] = normalizeVisitMeta({
        ...existingMeta,
        ...(shouldUpdateSource
          ? {
              source: normalizedMeta.source,
              referrerHost: normalizedMeta.referrerHost,
              landingPath: normalizedMeta.landingPath,
              utmSource: normalizedMeta.utmSource,
              utmMedium: normalizedMeta.utmMedium,
              utmCampaign: normalizedMeta.utmCampaign,
            }
          : {}),
        ...(shouldUpdateRegion
          ? {
              country: normalizedMeta.country,
              province: normalizedMeta.province,
              city: normalizedMeta.city,
              regionLabel: normalizedMeta.regionLabel,
            }
          : {}),
      });
      data[day] = bucket;
      data = trimVisitorStats(data);
      writeVisitorStatsRaw(data);
    }
    return;
  }
  data[day] = {
    ips: [...bucket.ips, normalized],
    sourceByIp: {
      ...bucket.sourceByIp,
      [normalized]: normalizedMeta,
    },
  };
  data = trimVisitorStats(data);
  writeVisitorStatsRaw(data);
};

const backfillVisitorRegionStats = () => {
  const data = readVisitorStatsRaw();
  const days = Object.keys(data);
  if (days.length === 0) return;

  let changed = false;
  const nextData = {};

  for (const day of days) {
    const rawBucket = data[day];
    const normalizedBucket = normalizeVisitorBucket(rawBucket);
    const rawSourceByIp =
      rawBucket && rawBucket.sourceByIp && typeof rawBucket.sourceByIp === 'object' ? rawBucket.sourceByIp : {};
    const nextSourceByIp = {};

    for (const ip of normalizedBucket.ips) {
      const baseMeta = normalizeVisitMeta(normalizedBucket.sourceByIp[ip] || {source: 'unknown'});
      const existingRawMeta = rawSourceByIp[ip];
      const hasRegionFields =
        !!existingRawMeta &&
        typeof existingRawMeta === 'object' &&
        typeof existingRawMeta.country === 'string' &&
        typeof existingRawMeta.province === 'string' &&
        typeof existingRawMeta.city === 'string' &&
        typeof existingRawMeta.regionLabel === 'string';

      let nextMeta = baseMeta;
      if (baseMeta.regionLabel === UNKNOWN_REGION_LABEL) {
        const resolvedRegion = resolveRegionByIp(ip);
        nextMeta = normalizeVisitMeta({...baseMeta, ...resolvedRegion});
      }
      if (!hasRegionFields || nextMeta.regionLabel !== baseMeta.regionLabel) changed = true;
      nextSourceByIp[ip] = nextMeta;
    }

    const hadMissingMeta = normalizedBucket.ips.some((ip) => !rawSourceByIp[ip]);
    if (hadMissingMeta) changed = true;

    nextData[day] = {
      ips: normalizedBucket.ips,
      sourceByIp: nextSourceByIp,
    };
  }

  if (changed) {
    writeVisitorStatsRaw(trimVisitorStats(nextData));
  }
};

const dataFile = path.join(__dirname, 'data.json');
const vibecodingProjectsFile = path.join(__dirname, 'vibecoding-projects.json');
const proposalAnnotationsFile = path.join(__dirname, 'proposal-annotations.json');
const uploadsRoot = path.join(__dirname, 'uploads');
const pdfTempRoot = path.join(__dirname, '.upload-tmp', 'pdfs');
const timelineVideoTempRoot = path.join(__dirname, '.upload-tmp', 'timeline-videos');
const localImportRoot = path.join(uploadsRoot, 'local-import');
const localImportVideoRoot = path.join(localImportRoot, 'videos');
const localImportPdfRoot = path.join(localImportRoot, 'pdfs');
const publicRoot = path.join(__dirname, 'public');
const vibecodingProjectsRoot = path.join(publicRoot, 'vibecoding-projects');
const distRoot = path.join(__dirname, 'dist');
const uploadMaxBytes = maxUploadMb > 0 ? maxUploadMb * 1024 * 1024 : 0;
// Multipart PDF upload (binary); when MAX_UPLOAD_MB is 0, still cap multer (override via MAX_PDF_UPLOAD_MB).
const pdfMulterLimitBytes =
  uploadMaxBytes > 0
    ? uploadMaxBytes
    : Math.max(1, Number(process.env.MAX_PDF_UPLOAD_MB || 600)) * 1024 * 1024;
const timelineVideoMulterLimitBytes =
  uploadMaxBytes > 0
    ? uploadMaxBytes
    : Math.max(1, Number(process.env.MAX_TIMELINE_VIDEO_UPLOAD_MB || 600)) * 1024 * 1024;
const allowedTimelineVideoMimes = new Set(['video/mp4', 'video/webm', 'video/ogg']);
const allowedTimelineVideoExts = new Set(['.mp4', '.webm', '.ogg']);
const isAllowedTimelineVideoUpload = (mime, fileName) => {
  const normalizedMime = String(mime || '').toLowerCase();
  if (allowedTimelineVideoMimes.has(normalizedMime)) return true;
  const ext = String(path.extname(String(fileName || '')) || '').toLowerCase();
  return allowedTimelineVideoExts.has(ext);
};
const localImportVideoExts = new Set(['.mp4', '.webm', '.ogg']);
const localImportPdfExts = new Set(['.pdf']);
const localImportVibecodingExts = new Set(['.html', '.htm']);

const pdfUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureDir(pdfTempRoot);
      cb(null, pdfTempRoot);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const safeBase = sanitizeFileName(file.originalname || 'portfolio.pdf');
    const ext = getExtFromMime(file.mimetype || '') || path.extname(safeBase) || '.pdf';
    const baseName = path.basename(safeBase, path.extname(safeBase));
    cb(null, `${createId('pdfupload_')}-${baseName}${ext}`);
  },
});

const pdfUploadMiddleware = multer({
  storage: pdfUploadStorage,
  limits: {fileSize: pdfMulterLimitBytes},
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF file is allowed'));
    }
  },
});
const timelineVideoUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureDir(timelineVideoTempRoot);
      cb(null, timelineVideoTempRoot);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const safeBase = sanitizeFileName(file.originalname || 'timeline-video');
    const ext = getExtFromMime(file.mimetype || '') || path.extname(safeBase) || '.mp4';
    const baseName = path.basename(safeBase, path.extname(safeBase));
    cb(null, `${createId('timelinevideo_')}-${baseName}${ext}`);
  },
});
const timelineVideoUploadMiddleware = multer({
  storage: timelineVideoUploadStorage,
  limits: {fileSize: timelineVideoMulterLimitBytes},
  fileFilter: (req, file, cb) => {
    if (isAllowedTimelineVideoUpload(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP4/WEBM/OGG video is allowed'));
    }
  },
});
const allowedImageMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const allowedAwardImageMimes = new Set(['image/jpeg', 'image/png']);
const allowedPdfCoverImageMimes = new Set(['image/jpeg', 'image/png']);
const allowedJournalImageMimes = new Set(['image/jpeg', 'image/png']);
const allowedPdfMimes = new Set(['application/pdf']);
const ADMIN_AUTH_MAX_ATTEMPTS = Number(process.env.ADMIN_AUTH_MAX_ATTEMPTS || 6);
const ADMIN_AUTH_WINDOW_MS = Number(process.env.ADMIN_AUTH_WINDOW_MS || 5 * 60 * 1000);
const ADMIN_AUTH_BLOCK_MS = Number(process.env.ADMIN_AUTH_BLOCK_MS || 10 * 60 * 1000);
const authRateStore = new Map();

const createId = (prefix = '') => `${prefix}${crypto.randomUUID()}`;

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, {recursive: true});
};

const safeUnlink = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup only.
  }
};

const sanitizeFileName = (name = '') =>
  name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'file';

const getExtFromMime = (mime) => {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/webm') return '.webm';
  if (mime === 'video/ogg') return '.ogg';
  return '';
};

const parseDataUrl = (dataUrl) => {
  const match = dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  return {mime, buffer: Buffer.from(base64, 'base64')};
};

const normalizeCoverAspect = (value) =>
  ALLOWED_COVER_ASPECTS.has(value) ? value : '3:4';

const normalizeTimelineCategory = (value) =>
  ALLOWED_TIMELINE_CATEGORIES.has(value) ? value : 'project';
const normalizeContentMode = (value) => (value === 'flow' ? 'flow' : 'whiteboard');
const normalizeTimelineVideoSources = (value) =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const url = typeof item.url === 'string' ? item.url.trim() : '';
          if (!url) return null;
          return {
            label: typeof item.label === 'string' ? item.label.trim() : '',
            url,
            relativePath: typeof item.relativePath === 'string' ? item.relativePath.trim() : '',
            mime: typeof item.mime === 'string' ? item.mime.trim() : '',
            size: Number(item.size) || 0,
            height: Number(item.height) || 0,
            width: Number(item.width) || 0,
            bitrateKbps: Number(item.bitrateKbps) || 0,
            isOriginal: !!item.isOriginal,
          };
        })
        .filter(Boolean)
    : [];

const pickVideoLabelFromHeight = (height) => {
  const h = Number(height) || 0;
  if (h >= 1000 && h <= 1180) return '1080p';
  if (h >= 660 && h <= 780) return '720p';
  if (h >= 430 && h <= 540) return '480p';
  return 'Original';
};

const probeVideoMeta = (absPath) => {
  try {
    const result = spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,bit_rate',
        '-of',
        'json',
        absPath,
      ],
      {encoding: 'utf8', windowsHide: true},
    );
    if (result.status !== 0) return null;
    const parsed = JSON.parse(result.stdout || '{}');
    const stream = Array.isArray(parsed?.streams) ? parsed.streams[0] : null;
    if (!stream) return null;
    return {
      width: Number(stream.width) || 0,
      height: Number(stream.height) || 0,
      bitrateKbps: Math.round((Number(stream.bit_rate) || 0) / 1000),
    };
  } catch {
    return null;
  }
};

const TIMELINE_VIDEO_VARIANTS = [
  {label: '1080p', height: 1080, bitrateKbps: 4500},
  {label: '720p', height: 720, bitrateKbps: 2600},
  {label: '480p', height: 480, bitrateKbps: 1200},
];

const generateTimelineVideoVariants = ({entryId, absPath, fileId, baseName, mime, originalName, size}) => {
  const sourceMeta = probeVideoMeta(absPath);
  const relativePath = path.join('uploads', 'timeline', entryId, path.basename(absPath));
  const originalUrl = `/${relativePath.replace(/\\/g, '/')}`;
  const sources = [
    {
      label: pickVideoLabelFromHeight(sourceMeta?.height),
      url: originalUrl,
      relativePath,
      mime,
      size: Number(size) || 0,
      height: Number(sourceMeta?.height) || 0,
      width: Number(sourceMeta?.width) || 0,
      bitrateKbps: Number(sourceMeta?.bitrateKbps) || 0,
      isOriginal: true,
      originalName,
    },
  ];

  if (!sourceMeta?.height || !sourceMeta?.width) {
    return {
      defaultUrl: originalUrl,
      sources,
    };
  }

  for (const variant of TIMELINE_VIDEO_VARIANTS) {
    if (sourceMeta.height <= variant.height) continue;
    const variantFileName = `${fileId}-${baseName}-${variant.label}.mp4`;
    const variantAbsPath = path.join(path.dirname(absPath), variantFileName);
    const scaleFilter = `scale=-2:${variant.height}`;
    const ffmpeg = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        absPath,
        '-vf',
        scaleFilter,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-maxrate',
        `${variant.bitrateKbps}k`,
        '-bufsize',
        `${variant.bitrateKbps * 2}k`,
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        variantAbsPath,
      ],
      {encoding: 'utf8', windowsHide: true},
    );
    if (ffmpeg.status !== 0 || !fs.existsSync(variantAbsPath)) continue;
    const variantMeta = probeVideoMeta(variantAbsPath);
    let variantSize = 0;
    try {
      variantSize = Number(fs.statSync(variantAbsPath).size) || 0;
    } catch {
      variantSize = 0;
    }
    const variantRelativePath = path.join('uploads', 'timeline', entryId, variantFileName);
    sources.push({
      label: variant.label,
      url: `/${variantRelativePath.replace(/\\/g, '/')}`,
      relativePath: variantRelativePath,
      mime: 'video/mp4',
      size: variantSize,
      height: Number(variantMeta?.height) || variant.height,
      width: Number(variantMeta?.width) || 0,
      bitrateKbps: variant.bitrateKbps,
      isOriginal: false,
      originalName: variantFileName,
    });
  }

  const defaultSource =
    sources.find((item) => item.label === '720p') ||
    sources.find((item) => item.label === '480p') ||
    sources.find((item) => item.label === '1080p') ||
    sources[0];

  return {
    defaultUrl: defaultSource?.url || originalUrl,
    sources,
  };
};

const isLegacyAwardTimelineItem = (item) => item?.category === 'award';

const parseSortableDate = (value) => {
  if (!value || typeof value !== 'string') return 0;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  const digits = value.match(/\d+/g);
  if (!digits || digits.length === 0) return 0;
  const y = Number(digits[0] || 0);
  const m = Number(digits[1] || 1);
  const d = Number(digits[2] || 1);
  const dt = new Date(y, Math.max(0, m - 1), Math.max(1, d));
  const t = dt.getTime();
  return Number.isFinite(t) ? t : 0;
};

const sortAwardsByDateDesc = (awards) =>
  [...awards].sort((a, b) => parseSortableDate(b?.date) - parseSortableDate(a?.date));
const sortPdfs = (pdfs) =>
  [...pdfs].sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : 999999;
    const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : 999999;
    if (orderA !== orderB) return orderA - orderB;
    return parseSortableDate(b?.date) - parseSortableDate(a?.date);
  });
const sortJournals = (journals) =>
  [...journals].sort((a, b) => {
    const byDate = parseSortableDate(b?.date) - parseSortableDate(a?.date);
    if (byDate !== 0) return byDate;
    return parseSortableDate(b?.updatedAt) - parseSortableDate(a?.updatedAt);
  });
const sortVibecodingProjects = (projects) =>
  [...projects].sort((a, b) => {
    const byUpdated = parseSortableDate(b?.updatedAt) - parseSortableDate(a?.updatedAt);
    if (byUpdated !== 0) return byUpdated;
    return String(a?.title || '').localeCompare(String(b?.title || ''));
  });

const sortTimelineEntries = (timeline) =>
  [...timeline].sort((a, b) => {
    const byDate = parseSortableDate(b?.date) - parseSortableDate(a?.date);
    if (byDate !== 0) return byDate;
    return parseSortableDate(b?.createdAt) - parseSortableDate(a?.createdAt);
  });

const normalizeAwardText = (value) => (typeof value === 'string' ? value : '');
const normalizePdfText = (value) => (typeof value === 'string' ? value : '');
const normalizeJournalText = (value) => (typeof value === 'string' ? value : '');
const normalizeVibecodingText = (value) => (typeof value === 'string' ? value : '');

const slugifyText = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'project';
};

const extractImageSize = (buffer, mime) => {
  try {
    if (mime === 'image/png' && buffer.length >= 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0) return {width, height};
    }

    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        offset += 2;
        if (marker === 0xd8 || marker === 0xd9) continue;
        if (offset + 2 > buffer.length) break;
        const size = buffer.readUInt16BE(offset);
        if (size < 2 || offset + size > buffer.length) break;
        const isSOF =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf);
        if (isSOF && offset + 7 < buffer.length) {
          const height = buffer.readUInt16BE(offset + 3);
          const width = buffer.readUInt16BE(offset + 5);
          if (width > 0 && height > 0) return {width, height};
        }
        offset += size;
      }
    }
  } catch {
    return null;
  }
  return null;
};

const pickJournalCoverFromLayout = (layout, fallbackCover = '') => {
  if (Array.isArray(layout?.elements)) {
    for (const element of layout.elements) {
      if (element?.type !== 'image') continue;
      const url = normalizeJournalText(element.url).trim();
      if (url) return url;
    }
  }
  return normalizeJournalText(fallbackCover).trim();
};

const ensureDataShape = (raw) => {
  const data = raw && typeof raw === 'object' ? raw : {};
  data.timeline = Array.isArray(data.timeline) ? data.timeline : [];
  data.cows = Array.isArray(data.cows) ? data.cows : [];
  data.assets = Array.isArray(data.assets) ? data.assets : [];
  data.awards = Array.isArray(data.awards) ? data.awards : [];
  data.pdfs = Array.isArray(data.pdfs) ? data.pdfs : [];
  data.journals = Array.isArray(data.journals) ? data.journals : [];
  data.vibecodingProjects = Array.isArray(data.vibecodingProjects) ? data.vibecodingProjects : [];
  data.adminMeta = data.adminMeta && typeof data.adminMeta === 'object' ? data.adminMeta : {};

  let changed = false;
  const migratedAwards = [];
  data.timeline = data.timeline
    .map((item) => {
    if (!item || typeof item !== 'object') return item;
    const nextItem = {...item};
    if (!nextItem.id) {
      changed = true;
      nextItem.id = createId('entry_');
    }
    if (isLegacyAwardTimelineItem(nextItem)) {
      changed = true;
      migratedAwards.push({
        id: createId('award_'),
        date: nextItem.date || '',
        title: nextItem.title || 'Untitled Award',
        workTitle: nextItem.desc || '',
        certificateNo: '',
        projectName: '',
        authorName: '',
        instructorName: '',
        organizationName: '',
        awardLevel: '',
        organizer: '',
        workEntryIds: [],
        image: nextItem.image || '',
        thumbnailImage: normalizeAwardText(nextItem.thumbnailImage),
        imageNaturalWidth: nextItem.imageNaturalWidth,
        imageNaturalHeight: nextItem.imageNaturalHeight,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return null;
    }
    const normalizedCategory = normalizeTimelineCategory(nextItem.category);
    if (nextItem.category !== normalizedCategory) {
      changed = true;
      nextItem.category = normalizedCategory;
    }
    const normalizedAspect = normalizeCoverAspect(nextItem.coverAspect);
    if (nextItem.coverAspect !== normalizedAspect) {
      changed = true;
      nextItem.coverAspect = normalizedAspect;
    }
    const normalizedVideoSources = normalizeTimelineVideoSources(nextItem.videoSources);
    if (JSON.stringify(nextItem.videoSources || []) !== JSON.stringify(normalizedVideoSources)) {
      changed = true;
      nextItem.videoSources = normalizedVideoSources;
    }
    if (!nextItem.videoUrl && normalizedVideoSources[0]?.url) {
      changed = true;
      nextItem.videoUrl = normalizedVideoSources[0].url;
    }
    const inferredMode =
      nextItem.contentMode ||
      (!nextItem.layout && Array.isArray(nextItem.blocks) && nextItem.blocks.length > 0 ? 'flow' : 'whiteboard');
    const normalizedMode = normalizeContentMode(inferredMode);
    if (nextItem.contentMode !== normalizedMode) {
      changed = true;
      nextItem.contentMode = normalizedMode;
    }
    const normalizedThumb =
      typeof nextItem.thumbnailImage === 'string' ? nextItem.thumbnailImage.trim() : '';
    if ((nextItem.thumbnailImage || '') !== normalizedThumb) {
      changed = true;
      nextItem.thumbnailImage = normalizedThumb;
    }
    return nextItem;
    })
    .filter(Boolean);

  const normalizedAwards = data.awards
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const next = {...item};
      if (!next.id) {
        changed = true;
        next.id = createId('award_');
      }
      if (!Array.isArray(next.workEntryIds)) {
        changed = true;
        next.workEntryIds = [];
      } else {
        next.workEntryIds = next.workEntryIds
          .filter((id) => typeof id === 'string' && id.trim())
          .map((id) => id.trim());
      }
      if (!next.createdAt) {
        changed = true;
        next.createdAt = new Date().toISOString();
      }
      if (!next.updatedAt) {
        changed = true;
        next.updatedAt = next.createdAt;
      }
      for (const field of [
        'workTitle',
        'certificateNo',
        'projectName',
        'authorName',
        'instructorName',
        'organizationName',
        'awardLevel',
        'organizer',
        'thumbnailImage',
      ]) {
        const normalized = normalizeAwardText(next[field]);
        if (next[field] !== normalized) {
          changed = true;
          next[field] = normalized;
        }
      }
      return next;
    });

  if (migratedAwards.length > 0) {
    data.awards = normalizedAwards.concat(migratedAwards);
  } else {
    data.awards = normalizedAwards;
  }
  data.pdfs = data.pdfs
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const next = {...item};
      if (!next.id) {
        changed = true;
        next.id = createId('pdf_');
      }
      next.title = normalizePdfText(next.title) || 'Untitled PDF';
      next.date = normalizePdfText(next.date);
      next.description = normalizePdfText(next.description);
      next.fileUrl = normalizePdfText(next.fileUrl);
      next.relativePath = normalizePdfText(next.relativePath);
      next.coverImage = normalizePdfText(next.coverImage);
      next.size = Number(next.size) || 0;
      next.coverImageNaturalWidth = Number(next.coverImageNaturalWidth) || undefined;
      next.coverImageNaturalHeight = Number(next.coverImageNaturalHeight) || undefined;
      next.pageCount = Number(next.pageCount) || undefined;
      next.order = Number.isFinite(Number(next.order)) ? Number(next.order) : 0;
      if (!Array.isArray(next.workEntryIds)) {
        changed = true;
        next.workEntryIds = [];
      } else {
        next.workEntryIds = next.workEntryIds
          .filter((id) => typeof id === 'string' && id.trim())
          .map((id) => id.trim());
      }
      if (!next.createdAt) {
        changed = true;
        next.createdAt = new Date().toISOString();
      }
      if (!next.updatedAt) {
        changed = true;
        next.updatedAt = next.createdAt;
      }
      return next;
    });
  data.journals = data.journals
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const next = {...item};
      if (!next.id) {
        changed = true;
        next.id = createId('journal_');
      }
      next.title = normalizeJournalText(next.title) || 'Untitled Journal';
      next.date = normalizeJournalText(next.date);
      next.note = normalizeJournalText(next.note);
      next.coverImage = normalizeJournalText(next.coverImage);
      next.layout = next.layout && typeof next.layout === 'object' ? next.layout : {
        version: 1,
        canvas: {width: 1920, height: 1080, bgColor: '#ffffff'},
        elements: [],
      };
      if (!next.createdAt) {
        changed = true;
        next.createdAt = new Date().toISOString();
      }
      if (!next.updatedAt) {
        changed = true;
        next.updatedAt = next.createdAt;
      }
      return next;
    });
  {
    const normalized = normalizeVibecodingProjectsCollection(data.vibecodingProjects);
    data.vibecodingProjects = normalized.projects;
    if (normalized.changed) changed = true;
  }
  const defaultCleanupSummary = {
    mode: 'execute',
    removedOrphanAssetRecords: 0,
    removedDeletedAssetFiles: 0,
    removedOrphanDiskFiles: 0,
    removedEmptyDirs: 0,
  };
  if (!data.adminMeta.lastCleanupSummary || typeof data.adminMeta.lastCleanupSummary !== 'object') {
    changed = true;
    data.adminMeta.lastCleanupSummary = defaultCleanupSummary;
  }
  if (!data.adminMeta.lastCleanupAt) {
    data.adminMeta.lastCleanupAt = null;
  }

  return {data, changed};
};

const writeVibecodingProjects = (projects) => {
  fs.writeFileSync(vibecodingProjectsFile, JSON.stringify(projects, null, 2), 'utf8');
};

const readVibecodingProjects = () => {
  let seedProjects = [];
  if (fs.existsSync(vibecodingProjectsFile)) {
    const parsed = JSON.parse(fs.readFileSync(vibecodingProjectsFile, 'utf8'));
    seedProjects = Array.isArray(parsed) ? parsed : [];
  } else if (fs.existsSync(dataFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      seedProjects = Array.isArray(parsed?.vibecodingProjects) ? parsed.vibecodingProjects : [];
    } catch {
      seedProjects = [];
    }
  }
  const normalized = normalizeVibecodingProjectsCollection(seedProjects);
  if (!fs.existsSync(vibecodingProjectsFile) || normalized.changed) {
    writeVibecodingProjects(normalized.projects);
  }
  return normalized.projects;
};

const readData = () => {
  if (!fs.existsSync(dataFile)) {
    return {
      timeline: [],
      cows: [],
      assets: [],
      awards: [],
      pdfs: [],
      journals: [],
      vibecodingProjects: readVibecodingProjects(),
    };
  }
  const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const {data, changed} = ensureDataShape(parsed);
  if (changed) writeData(data);
  data.vibecodingProjects = readVibecodingProjects();
  return data;
};

const writeData = (data) => {
  const next = {...(data || {})};
  delete next.vibecodingProjects;
  fs.writeFileSync(dataFile, JSON.stringify(next, null, 2), 'utf8');
};

const normalizeProposalNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeProposalPoint = (point) => ({
  x: Math.min(1, Math.max(0, normalizeProposalNumber(point?.x))),
  y: Math.min(1, Math.max(0, normalizeProposalNumber(point?.y))),
});

const normalizeProposalRect = (rect) => {
  const x = Math.min(1, Math.max(0, normalizeProposalNumber(rect?.x)));
  const y = Math.min(1, Math.max(0, normalizeProposalNumber(rect?.y)));
  const w = Math.min(1 - x, Math.max(0.002, normalizeProposalNumber(rect?.w, 0.08)));
  const h = Math.min(1 - y, Math.max(0.002, normalizeProposalNumber(rect?.h, 0.04)));
  return {x, y, w, h};
};

const normalizeProposalAnnotation = (item) => {
  if (!item || typeof item !== 'object') return null;
  const type = ['pen', 'rect', 'highlight', 'text'].includes(item.type) ? item.type : '';
  if (!type) return null;
  const now = new Date().toISOString();
  const id = String(item.id || createId('proposal_note_')).trim().slice(0, 120);
  const pageIndex = Math.max(0, Math.floor(normalizeProposalNumber(item.pageIndex)));
  const base = {
    id,
    pageIndex,
    type,
    color: String(item.color || (type === 'highlight' ? '#facc15' : '#ef4444')).trim().slice(0, 32),
    strokeWidth: Math.min(28, Math.max(1, normalizeProposalNumber(item.strokeWidth, 3))),
    fontSize: Math.min(64, Math.max(10, normalizeProposalNumber(item.fontSize, 18))),
    createdAt: String(item.createdAt || now).slice(0, 40),
    updatedAt: String(item.updatedAt || now).slice(0, 40),
  };
  if (type === 'pen') {
    const points = Array.isArray(item.points) ? item.points.map(normalizeProposalPoint).slice(0, 4000) : [];
    if (points.length < 2) return null;
    return {...base, points};
  }
  if (type === 'text') {
    const text = String(item.text || '').slice(0, 1000);
    return {...base, rect: normalizeProposalRect(item.rect), text};
  }
  return {...base, rect: normalizeProposalRect(item.rect)};
};

const normalizeProposalAnnotationsPayload = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const annotations = Array.isArray(source.annotations)
    ? source.annotations.map(normalizeProposalAnnotation).filter(Boolean)
    : [];
  return {
    success: true,
    version: Math.max(1, Math.floor(normalizeProposalNumber(source.version, 1))),
    updatedAt: String(source.updatedAt || new Date().toISOString()).slice(0, 40),
    annotations,
  };
};

const readProposalAnnotations = () => {
  if (!fs.existsSync(proposalAnnotationsFile)) {
    const empty = normalizeProposalAnnotationsPayload({version: 1, annotations: []});
    fs.writeFileSync(proposalAnnotationsFile, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(proposalAnnotationsFile, 'utf8'));
    return normalizeProposalAnnotationsPayload(parsed);
  } catch {
    return normalizeProposalAnnotationsPayload({version: 1, annotations: []});
  }
};

const writeProposalAnnotations = (annotations) => {
  const previous = readProposalAnnotations();
  const next = normalizeProposalAnnotationsPayload({
    version: previous.version + 1,
    updatedAt: new Date().toISOString(),
    annotations: Array.isArray(annotations) ? annotations : [],
  });
  fs.writeFileSync(proposalAnnotationsFile, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

const findAsset = (data, assetId) =>
  data.assets.find((a) => a && a.id === assetId && !a.deleted);

const collectReferencedAssetIds = (data) => {
  const ids = new Set();
  const urlToId = new Map(
    data.assets
      .filter((a) => a && !a.deleted)
      .map((a) => [a.url, a.id]),
  );
  const addByUrl = (urlValue) => {
    if (!urlValue) return;
    const raw = String(urlValue).trim();
    if (!raw) return;
    if (urlToId.has(raw)) ids.add(urlToId.get(raw));
    const withoutQuery = raw.split('?')[0].split('#')[0];
    if (urlToId.has(withoutQuery)) ids.add(urlToId.get(withoutQuery));
  };

  for (const item of data.timeline) {
    if (!item) continue;
    addByUrl(item.image);
    addByUrl(item.thumbnailImage);
    addByUrl(item.logo);
    addByUrl(item.videoUrl);

    const elements = item.layout?.elements;
    if (Array.isArray(elements)) {
      for (const el of elements) {
        if (el?.type !== 'image') continue;
        if (el.assetId) ids.add(el.assetId);
        addByUrl(el.url);
      }
    }

    const blocks = item.blocks;
    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (block?.type !== 'image') continue;
        if (block.assetId) ids.add(block.assetId);
        addByUrl(block.url);
      }
    }
  }

  for (const award of data.awards || []) {
    addByUrl(award?.image);
    addByUrl(award?.thumbnailImage);
  }

  for (const pdf of data.pdfs || []) {
    addByUrl(pdf?.fileUrl);
    addByUrl(pdf?.coverImage);
  }

  for (const journal of data.journals || []) {
    addByUrl(journal?.coverImage);
    const elements = journal?.layout?.elements;
    if (!Array.isArray(elements)) continue;
    for (const el of elements) {
      if (el?.type !== 'image') continue;
      if (el.assetId) ids.add(el.assetId);
      addByUrl(el.url);
    }
  }

  for (const project of data.vibecodingProjects || []) {
    addByUrl(project?.coverImage);
  }

  return ids;
};

const removeAssetFile = (relativePath) => {
  if (!relativePath) return;
  const abs = path.join(__dirname, relativePath);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
};

const deleteAssetRecord = (asset) => {
  removeAssetFile(asset.relativePath);
  asset.deleted = true;
};

const getClientIp = (req) => {
  const cfConnectingIp = normalizeIpAddress(req.headers['cf-connecting-ip'] || '');
  if (cfConnectingIp) return cfConnectingIp;

  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) {
    const firstForwarded = normalizeIpAddress(forwarded.split(',')[0] || '');
    if (firstForwarded) return firstForwarded;
  }

  const expressIp = normalizeIpAddress(req.ip || '');
  if (expressIp) return expressIp;
  const remote = normalizeIpAddress(req.socket?.remoteAddress || '');
  return remote || 'unknown';
};

try {
  backfillVisitorRegionStats();
} catch (err) {
  console.error('[VISITOR_REGION_BACKFILL]', err);
}

const compactAuthRateStore = () => {
  const now = Date.now();
  for (const [key, value] of authRateStore.entries()) {
    if (!value) continue;
    if ((value.blockedUntil || 0) > now) continue;
    if ((value.lastAttemptAt || 0) + ADMIN_AUTH_WINDOW_MS * 2 > now) continue;
    authRateStore.delete(key);
  }
};

const checkAuthRateLimit = (clientKey) => {
  const now = Date.now();
  const state = authRateStore.get(clientKey);
  if (!state) return {blocked: false, retryAfterMs: 0};
  if ((state.blockedUntil || 0) > now) {
    return {blocked: true, retryAfterMs: state.blockedUntil - now};
  }
  return {blocked: false, retryAfterMs: 0};
};

const markAuthAttempt = (clientKey, success) => {
  const now = Date.now();
  const current = authRateStore.get(clientKey) || {
    count: 0,
    firstAttemptAt: now,
    lastAttemptAt: now,
    blockedUntil: 0,
  };
  if (success) {
    authRateStore.delete(clientKey);
    return;
  }
  if (now - (current.firstAttemptAt || now) > ADMIN_AUTH_WINDOW_MS) {
    current.count = 0;
    current.firstAttemptAt = now;
  }
  current.count += 1;
  current.lastAttemptAt = now;
  if (current.count >= ADMIN_AUTH_MAX_ATTEMPTS) {
    current.blockedUntil = now + ADMIN_AUTH_BLOCK_MS;
    current.count = 0;
    current.firstAttemptAt = now;
  }
  authRateStore.set(clientKey, current);
};

const auditAuth = (req, ok, reason = '') => {
  const ip = getClientIp(req);
  const timestamp = new Date().toISOString();
  const label = ok ? 'SUCCESS' : 'FAIL';
  const suffix = reason ? ` (${reason})` : '';
  console.log(`[ADMIN_AUTH] ${timestamp} ${label}${suffix} ip=${ip}`);
};

const toPosixPath = (value = '') => String(value).replace(/\\/g, '/');

const normalizeUploadRelativePath = (value = '') =>
  toPosixPath(String(value || ''))
    .replace(/^\/+/, '')
    .replace(/\.\./g, '')
    .trim();

const normalizeRepoRelativePath = (value = '') =>
  toPosixPath(String(value || ''))
    .replace(/^\/+/, '')
    .replace(/\.\./g, '')
    .trim();

const extractUploadRelativePathFromUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw.split('?')[0].split('#')[0];
  const normalized = normalizeUploadRelativePath(cleaned);
  if (normalized.startsWith('uploads/')) return normalized;
  const index = normalized.indexOf('/uploads/');
  if (index >= 0) return normalized.slice(index + 1);
  return '';
};

const vibecodingImportPrefix = 'public/vibecoding-projects/';
const legacyVibecodingImportPrefix = 'uploads/local-import/vibecoding/';
const vibecodingUrlPrefix = '/vibecoding-projects/';

const normalizeVibecodingPublicUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const cleaned = raw.split('?')[0].split('#')[0];
  const normalized = normalizeRepoRelativePath(cleaned);
  if (!normalized) return '';
  if (normalized.startsWith(vibecodingImportPrefix)) {
    return `/${normalized.slice('public/'.length)}`;
  }
  if (normalized.startsWith(legacyVibecodingImportPrefix)) {
    return `${vibecodingUrlPrefix}${normalized.slice(legacyVibecodingImportPrefix.length)}`;
  }
  if (normalized.startsWith('vibecoding-projects/')) {
    return `/${normalized}`;
  }
  const publicIndex = normalized.indexOf('/public/vibecoding-projects/');
  if (publicIndex >= 0) {
    return `/${normalized.slice(publicIndex + '/public/'.length)}`;
  }
  const legacyIndex = normalized.indexOf('/uploads/local-import/vibecoding/');
  if (legacyIndex >= 0) {
    return `${vibecodingUrlPrefix}${normalized.slice(legacyIndex + '/uploads/local-import/vibecoding/'.length)}`;
  }
  return raw;
};

const normalizeVibecodingRelativePath = (value = '') => {
  const normalizedUrl = normalizeVibecodingPublicUrl(value);
  if (normalizedUrl.startsWith(vibecodingUrlPrefix)) {
    return normalizeRepoRelativePath(`public${normalizedUrl}`);
  }
  const normalized = normalizeRepoRelativePath(value);
  if (normalized.startsWith(vibecodingImportPrefix)) return normalized;
  if (normalized.startsWith(legacyVibecodingImportPrefix)) {
    return normalizeRepoRelativePath(
      `${vibecodingImportPrefix}${normalized.slice(legacyVibecodingImportPrefix.length)}`,
    );
  }
  return normalized;
};

const normalizeVibecodingCoverImage = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return normalizeVibecodingPublicUrl(raw) || raw;
};

const getVibecodingProjectRootRelativePath = (entryRelativePath) => {
  const normalized = normalizeVibecodingRelativePath(entryRelativePath);
  if (!normalized.startsWith(vibecodingImportPrefix)) return '';
  const remainder = normalized.slice(vibecodingImportPrefix.length);
  const segments = remainder.split('/').filter(Boolean);
  if (segments.length < 2) return '';
  return normalizeRepoRelativePath(`${vibecodingImportPrefix}${segments[0]}`);
};

const isValidVibecodingEntryRelativePath = (entryRelativePath) => {
  const normalized = normalizeVibecodingRelativePath(entryRelativePath);
  if (!normalized.startsWith(vibecodingImportPrefix)) return false;
  if (!localImportVibecodingExts.has(String(path.extname(normalized) || '').toLowerCase())) return false;
  return !!getVibecodingProjectRootRelativePath(normalized);
};

const buildVibecodingEntryUrl = (entryRelativePath) => {
  return normalizeVibecodingPublicUrl(entryRelativePath);
};

const ensureUniqueSlugFromSet = (value, usedSlugs) => {
  const base = slugifyText(value);
  if (!usedSlugs.has(base)) {
    usedSlugs.add(base);
    return base;
  }
  let suffix = 2;
  let next = `${base}-${suffix}`;
  while (usedSlugs.has(next)) {
    suffix += 1;
    next = `${base}-${suffix}`;
  }
  usedSlugs.add(next);
  return next;
};

const listVibecodingImportProjects = () => {
  ensureDir(vibecodingProjectsRoot);
  const groups = new Map();
  for (const absPath of listFilesRecursive(vibecodingProjectsRoot)) {
    const ext = String(path.extname(absPath) || '').toLowerCase();
    if (!localImportVibecodingExts.has(ext)) continue;
    const relativeToRoot = toPosixPath(path.relative(vibecodingProjectsRoot, absPath));
    const segments = relativeToRoot.split('/').filter(Boolean);
    if (segments.length < 2) continue;
    const folderName = segments[0];
    const projectRootAbs = path.join(vibecodingProjectsRoot, folderName);
    const projectRootRelativePath = normalizeRepoRelativePath(path.relative(__dirname, projectRootAbs));
    const relativePath = normalizeRepoRelativePath(path.relative(__dirname, absPath));
    if (!relativePath.startsWith(vibecodingImportPrefix)) continue;

    let size = 0;
    let modifiedAt = null;
    try {
      const stat = fs.statSync(absPath);
      size = Number(stat.size) || 0;
      modifiedAt = stat.mtime ? new Date(stat.mtime).toISOString() : null;
    } catch {
      // ignore stat failure
    }

    if (!groups.has(projectRootRelativePath)) {
      groups.set(projectRootRelativePath, {
        projectFolderName: folderName,
        projectRootRelativePath,
        entries: [],
      });
    }

    groups.get(projectRootRelativePath).entries.push({
      name: relativeToRoot,
      fileName: path.basename(absPath),
      url: buildVibecodingEntryUrl(relativePath),
      relativePath,
      size,
      modifiedAt,
    });
  }

  const projects = Array.from(groups.values())
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    }))
    .sort((a, b) => String(a.projectFolderName || '').localeCompare(String(b.projectFolderName || '')));

  return {
    folder: {
      absolutePath: vibecodingProjectsRoot,
      relativePath: normalizeRepoRelativePath(path.relative(__dirname, vibecodingProjectsRoot)),
      urlPrefix: vibecodingUrlPrefix,
    },
    projects,
  };
};

const buildVibecodingProjectRecord = ({
  incoming,
  existingProjects,
  prev,
}) => {
  const title = normalizeVibecodingText(incoming?.title ?? prev?.title) || 'Untitled Project';
  const description = normalizeVibecodingText(incoming?.description ?? prev?.description);
  const coverImage = normalizeVibecodingCoverImage(incoming?.coverImage ?? prev?.coverImage);
  let entryRelativePath = normalizeVibecodingRelativePath(
    incoming?.entryRelativePath ??
      prev?.entryRelativePath ??
      normalizeVibecodingRelativePath(incoming?.entryUrl ?? prev?.entryUrl),
  );
  if (!entryRelativePath) {
    entryRelativePath = normalizeVibecodingRelativePath(incoming?.entryUrl ?? prev?.entryUrl);
  }
  if (!isValidVibecodingEntryRelativePath(entryRelativePath)) {
    return {error: 'Entry HTML must be inside public/vibecoding-projects/<project-folder>/ and end with .html'};
  }

  const entryAbsPath = path.join(__dirname, entryRelativePath);
  if (!fs.existsSync(entryAbsPath) || !fs.statSync(entryAbsPath).isFile()) {
    return {error: 'Selected HTML entry file does not exist on disk'};
  }

  const projectRootRelativePath = getVibecodingProjectRootRelativePath(entryRelativePath);
  if (!projectRootRelativePath) {
    return {error: 'Could not determine the project root folder'};
  }

  const slugPool = new Set(
    (Array.isArray(existingProjects) ? existingProjects : [])
      .filter((item) => item && item.id !== prev?.id)
      .map((item) => slugifyText(item.slug || item.title || 'project')),
  );
  const folderSlugSeed = projectRootRelativePath.split('/').filter(Boolean).pop() || 'project';
  const requestedSlugSeed = prev?.slug || incoming?.slug || title;
  const preferredSlugSeed =
    slugifyText(requestedSlugSeed) === 'project' && folderSlugSeed ? folderSlugSeed : requestedSlugSeed;
  const slug = prev?.slug
    ? ensureUniqueSlugFromSet(prev.slug, slugPool)
    : ensureUniqueSlugFromSet(preferredSlugSeed, slugPool);

  return {
    project: {
      ...(prev || {}),
      id: incoming?.id || prev?.id || createId('vibe_'),
      slug,
      title,
      description,
      coverImage,
      entryUrl: buildVibecodingEntryUrl(entryRelativePath),
      entryRelativePath,
      projectRootRelativePath,
    },
  };
};

const normalizeVibecodingProjectsCollection = (projects) => {
  let changed = false;
  const usedSlugs = new Set();
  const normalizedProjects = (Array.isArray(projects) ? projects : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const next = {...item};
      if (!next.id) {
        changed = true;
        next.id = createId('vibe_');
      }
      next.title = normalizeVibecodingText(next.title) || 'Untitled Project';
      next.description = normalizeVibecodingText(next.description);
      const normalizedCoverImage = normalizeVibecodingCoverImage(next.coverImage);
      if ((next.coverImage || '') !== normalizedCoverImage) {
        changed = true;
        next.coverImage = normalizedCoverImage;
      } else {
        next.coverImage = normalizedCoverImage;
      }
      const normalizedEntryRelativePath = normalizeVibecodingRelativePath(
        next.entryRelativePath || next.entryUrl,
      );
      if (next.entryRelativePath !== normalizedEntryRelativePath) {
        changed = true;
        next.entryRelativePath = normalizedEntryRelativePath;
      }
      const normalizedEntryUrl = buildVibecodingEntryUrl(normalizedEntryRelativePath);
      if (next.entryUrl !== normalizedEntryUrl) {
        changed = true;
        next.entryUrl = normalizedEntryUrl;
      }
      const normalizedProjectRootRelativePath =
        getVibecodingProjectRootRelativePath(normalizedEntryRelativePath) ||
        normalizeVibecodingRelativePath(next.projectRootRelativePath);
      if (next.projectRootRelativePath !== normalizedProjectRootRelativePath) {
        changed = true;
        next.projectRootRelativePath = normalizedProjectRootRelativePath;
      }
      const fallbackSlugSeed =
        next.projectRootRelativePath.split('/').filter(Boolean).pop() ||
        next.slug ||
        next.title;
      const slugSeed =
        slugifyText(next.slug || next.title) === 'project' ? fallbackSlugSeed : next.slug || next.title;
      const uniqueSlug = ensureUniqueSlugFromSet(slugSeed, usedSlugs);
      if (next.slug !== uniqueSlug) {
        changed = true;
        next.slug = uniqueSlug;
      }
      if (!next.createdAt) {
        changed = true;
        next.createdAt = new Date().toISOString();
      }
      if (!next.updatedAt) {
        changed = true;
        next.updatedAt = next.createdAt;
      }
      return next;
    });
  return {projects: normalizedProjects, changed};
};

const listFilesRecursive = (rootDir) => {
  if (!fs.existsSync(rootDir)) return [];
  const found = [];
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        found.push(abs);
      }
    }
  };
  walk(rootDir);
  return found;
};

const resolveLocalImportConfig = (kindRaw) => {
  const kind = String(kindRaw || '').trim().toLowerCase();
  if (kind === 'video') {
    return {kind: 'video', rootDir: localImportVideoRoot, allowedExts: localImportVideoExts};
  }
  if (kind === 'pdf') {
    return {kind: 'pdf', rootDir: localImportPdfRoot, allowedExts: localImportPdfExts};
  }
  return null;
};

const listLocalImportFiles = (kindRaw) => {
  const config = resolveLocalImportConfig(kindRaw);
  if (!config) return null;
  ensureDir(config.rootDir);
  const files = [];
  for (const absPath of listFilesRecursive(config.rootDir)) {
    const ext = String(path.extname(absPath) || '').toLowerCase();
    if (!config.allowedExts.has(ext)) continue;
    const relativePath = normalizeUploadRelativePath(path.relative(__dirname, absPath));
    if (!relativePath.startsWith('uploads/')) continue;
    let size = 0;
    let modifiedAt = null;
    try {
      const stat = fs.statSync(absPath);
      size = Number(stat.size) || 0;
      modifiedAt = stat.mtime ? new Date(stat.mtime).toISOString() : null;
    } catch {
      // ignore stat failure
    }
    files.push({
      name: toPosixPath(path.relative(config.rootDir, absPath)),
      url: `/${relativePath}`,
      relativePath,
      size,
      modifiedAt,
    });
  }
  files.sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || '')));
  const folderRelativePath = normalizeUploadRelativePath(path.relative(__dirname, config.rootDir));
  return {
    kind: config.kind,
    folder: {
      absolutePath: config.rootDir,
      relativePath: folderRelativePath,
      urlPrefix: folderRelativePath ? `/${folderRelativePath.replace(/\/?$/, '/')}` : '/uploads/',
    },
    files,
  };
};

const collectReferencedUploadPaths = (data) => {
  const paths = new Set();
  for (const asset of data.assets || []) {
    if (!asset || asset.deleted) continue;
    const normalized = normalizeUploadRelativePath(asset.relativePath);
    if (normalized) paths.add(normalized);
  }

  for (const item of data.timeline || []) {
    if (!item) continue;
    const coverPath = extractUploadRelativePathFromUrl(item.image);
    if (coverPath) paths.add(coverPath);
    const thumbPath = extractUploadRelativePathFromUrl(item.thumbnailImage);
    if (thumbPath) paths.add(thumbPath);
    const logoPath = extractUploadRelativePathFromUrl(item.logo);
    if (logoPath) paths.add(logoPath);
    const videoPath = extractUploadRelativePathFromUrl(item.videoUrl);
    if (videoPath) paths.add(videoPath);
    const videoSources = Array.isArray(item.videoSources) ? item.videoSources : [];
    for (const source of videoSources) {
      const sourcePath =
        normalizeUploadRelativePath(source?.relativePath) ||
        extractUploadRelativePathFromUrl(source?.url);
      if (sourcePath) paths.add(sourcePath);
    }
    const elements = item.layout?.elements;
    if (Array.isArray(elements)) {
      for (const el of elements) {
        if (el?.type !== 'image') continue;
        const p = extractUploadRelativePathFromUrl(el.url);
        if (p) paths.add(p);
      }
    }
    if (Array.isArray(item.blocks)) {
      for (const block of item.blocks) {
        if (block?.type !== 'image') continue;
        const p = extractUploadRelativePathFromUrl(block.url);
        if (p) paths.add(p);
      }
    }
  }

  for (const award of data.awards || []) {
    const p = extractUploadRelativePathFromUrl(award?.image);
    if (p) paths.add(p);
    const thumbPath = extractUploadRelativePathFromUrl(award?.thumbnailImage);
    if (thumbPath) paths.add(thumbPath);
  }
  for (const pdf of data.pdfs || []) {
    const filePath = extractUploadRelativePathFromUrl(pdf?.fileUrl);
    if (filePath) paths.add(filePath);
    const coverPath = extractUploadRelativePathFromUrl(pdf?.coverImage);
    if (coverPath) paths.add(coverPath);
  }
  for (const journal of data.journals || []) {
    const coverPath = extractUploadRelativePathFromUrl(journal?.coverImage);
    if (coverPath) paths.add(coverPath);
    const elements = journal?.layout?.elements;
    if (!Array.isArray(elements)) continue;
    for (const el of elements) {
      if (el?.type !== 'image') continue;
      const p = extractUploadRelativePathFromUrl(el.url);
      if (p) paths.add(p);
    }
  }
  for (const project of data.vibecodingProjects || []) {
    const coverPath = extractUploadRelativePathFromUrl(project?.coverImage);
    if (coverPath) paths.add(coverPath);
    const entryPath =
      normalizeUploadRelativePath(project?.entryRelativePath) ||
      extractUploadRelativePathFromUrl(project?.entryUrl);
    if (entryPath) paths.add(entryPath);
  }

  // Keep USB-drop/import files intact even if not referenced yet.
  for (const absPath of listFilesRecursive(localImportRoot)) {
    const relativePath = normalizeUploadRelativePath(path.relative(__dirname, absPath));
    if (relativePath.startsWith('uploads/local-import/')) {
      paths.add(relativePath);
    }
  }
  return paths;
};

const removeEmptyDirsRecursive = (dir, stopAt) => {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    removed += removeEmptyDirsRecursive(path.join(dir, entry.name), stopAt);
  }
  const remaining = fs.readdirSync(dir);
  if (remaining.length === 0 && path.resolve(dir) !== path.resolve(stopAt)) {
    fs.rmdirSync(dir);
    removed += 1;
  }
  return removed;
};

const computeStorageAudit = (data) => {
  const referencedAssetIds = collectReferencedAssetIds(data);
  const liveAssets = (data.assets || []).filter((asset) => asset && !asset.deleted);
  const orphanAssets = liveAssets.filter((asset) => !referencedAssetIds.has(asset.id));
  const deletedAssets = (data.assets || []).filter((asset) => asset && asset.deleted);
  const deletedAssetsWithFile = deletedAssets.filter((asset) => {
    const relativePath = normalizeUploadRelativePath(asset.relativePath);
    if (!relativePath) return false;
    return fs.existsSync(path.join(__dirname, relativePath));
  });

  const keepPaths = collectReferencedUploadPaths(data);
  const allUploadFiles = listFilesRecursive(uploadsRoot);
  const allUploadRel = allUploadFiles.map((abs) =>
    normalizeUploadRelativePath(path.relative(__dirname, abs)),
  );
  const orphanDiskFiles = allUploadRel.filter((rel) => rel && !keepPaths.has(rel));

  const timelineRoot = path.join(uploadsRoot, 'timeline');
  const awardRoot = path.join(uploadsRoot, 'awards');
  const pdfRoot = path.join(uploadsRoot, 'pdfs');
  const journalRoot = path.join(uploadsRoot, 'journals');
  const timelineFiles = listFilesRecursive(timelineRoot).length;
  const awardFiles = listFilesRecursive(awardRoot).length;
  const pdfFiles = listFilesRecursive(pdfRoot).length;
  const journalFiles = listFilesRecursive(journalRoot).length;

  return {
    uploadRoot: uploadsRoot,
    totalAssetRecords: (data.assets || []).length,
    liveAssetRecords: liveAssets.length,
    deletedAssetRecords: deletedAssets.length,
    orphanAssetRecords: orphanAssets.length,
    deletedAssetFiles: deletedAssetsWithFile.length,
    totalUploadFiles: allUploadRel.length,
    timelineUploadFiles: timelineFiles,
    awardUploadFiles: awardFiles,
    pdfUploadFiles: pdfFiles,
    journalUploadFiles: journalFiles,
    orphanDiskFiles: orphanDiskFiles.length,
    emptyDirsEstimated: 0,
    lastCleanupAt: data.adminMeta?.lastCleanupAt || null,
    lastCleanupSummary: data.adminMeta?.lastCleanupSummary || null,
    sample: {
      orphanAssets: orphanAssets.slice(0, 10).map((asset) => ({
        id: asset.id,
        originalName: asset.originalName,
        relativePath: asset.relativePath,
      })),
      orphanFiles: orphanDiskFiles.slice(0, 20),
    },
  };
};

const cleanupStorageGarbage = (data, options = {}) => {
  const mode = options.mode === 'dry-run' ? 'dry-run' : 'execute';
  const opts = {
    removeOrphanAssetRecords: options.removeOrphanAssetRecords !== false,
    removeDeletedAssetFiles: options.removeDeletedAssetFiles !== false,
    removeOrphanDiskFiles: options.removeOrphanDiskFiles !== false,
    removeEmptyDirs: options.removeEmptyDirs !== false,
  };

  const referencedAssetIds = collectReferencedAssetIds(data);
  const keepPaths = collectReferencedUploadPaths(data);
  const orphanAssets = opts.removeOrphanAssetRecords
    ? (data.assets || []).filter((asset) => {
        if (!asset || asset.deleted) return false;
        if (referencedAssetIds.has(asset.id)) return false;
        const relativePath = normalizeUploadRelativePath(asset.relativePath);
        if (!relativePath) return true;
        // Safety rail: if a file path is still referenced in content, don't treat it as orphan.
        return !keepPaths.has(relativePath);
      })
    : [];
  const deletedAssetsWithFile = opts.removeDeletedAssetFiles
    ? (data.assets || []).filter((asset) => {
        if (!asset || !asset.deleted) return false;
        const relativePath = normalizeUploadRelativePath(asset.relativePath);
        if (!relativePath) return false;
        return fs.existsSync(path.join(__dirname, relativePath));
      })
    : [];
  const orphanDiskRelPaths = (() => {
    if (!opts.removeOrphanDiskFiles) return [];
    return listFilesRecursive(uploadsRoot)
      .map((abs) => normalizeUploadRelativePath(path.relative(__dirname, abs)))
      .filter((rel) => rel && !keepPaths.has(rel));
  })();

  const summary = {
    mode,
    removedOrphanAssetRecords: 0,
    removedDeletedAssetFiles: 0,
    removedOrphanDiskFiles: 0,
    removedEmptyDirs: 0,
    writtenData: false,
  };
  if (mode === 'dry-run') {
    summary.removedOrphanAssetRecords = orphanAssets.length;
    summary.removedDeletedAssetFiles = deletedAssetsWithFile.length;
    summary.removedOrphanDiskFiles = orphanDiskRelPaths.length;
    return summary;
  }

  if (opts.removeOrphanAssetRecords) {
    for (const asset of orphanAssets) {
      const relativePath = normalizeUploadRelativePath(asset.relativePath);
      if (relativePath) {
        const abs = path.join(__dirname, relativePath);
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      }
      asset.deleted = true;
      asset.entryId = null;
      summary.removedOrphanAssetRecords += 1;
      summary.writtenData = true;
    }
  }

  if (opts.removeDeletedAssetFiles) {
    for (const asset of deletedAssetsWithFile) {
      const relativePath = normalizeUploadRelativePath(asset.relativePath);
      if (!relativePath) continue;
      const abs = path.join(__dirname, relativePath);
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
        summary.removedDeletedAssetFiles += 1;
      }
    }
  }

  if (opts.removeOrphanDiskFiles) {
    for (const rel of orphanDiskRelPaths) {
      const abs = path.join(__dirname, rel);
      fs.unlinkSync(abs);
      summary.removedOrphanDiskFiles += 1;
    }
  }

  if (opts.removeEmptyDirs) {
    summary.removedEmptyDirs = removeEmptyDirsRecursive(uploadsRoot, uploadsRoot);
  }

  if (summary.writtenData) writeData(data);
  return summary;
};

const pickSecretText = (value) => (typeof value === 'string' ? value.trim() : '');

const extractAdminSecret = (req) => {
  const fromCustomHeader = pickSecretText(req.header('x-admin-secret'));
  if (fromCustomHeader) return fromCustomHeader;

  const authHeader = pickSecretText(req.header('authorization'));
  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = pickSecretText(bearerMatch ? bearerMatch[1] : authHeader);
    if (token) return token;
  }

  const fromBody = pickSecretText(req.body?.secret) || pickSecretText(req.body?.adminSecret);
  if (fromBody) return fromBody;

  return pickSecretText(req.query?.secret) || pickSecretText(req.query?.adminSecret);
};

const requireAdminSecret = (req, res, next) => {
  const provided = extractAdminSecret(req);
  if (!provided || provided !== RESOLVED_ADMIN_SECRET) {
    res.status(401).json({success: false, error: 'Unauthorized'});
    return;
  }
  next();
};

app.post('/api/admin/auth/verify', (req, res) => {
  compactAuthRateStore();
  const ip = getClientIp(req);
  const clientKey = `admin-auth:${ip}`;
  const limited = checkAuthRateLimit(clientKey);
  if (limited.blocked) {
    auditAuth(req, false, 'rate-limited');
    res.status(429).json({
      success: false,
      error: 'Too many attempts. Try later.',
      retryAfterMs: limited.retryAfterMs,
    });
    return;
  }
  const provided = extractAdminSecret(req);
  const ok = !!provided && provided === RESOLVED_ADMIN_SECRET;
  markAuthAttempt(clientKey, ok);
  auditAuth(req, ok, ok ? 'verified' : 'invalid-secret');
  if (!ok) {
    res.status(401).json({success: false, error: 'Unauthorized'});
    return;
  }
  res.json({success: true});
});

app.get('/api/visit/ping', (req, res) => {
  try {
    recordVisitForIp(getClientIp(req), getVisitMetaFromRequest(req));
    res.json({success: true});
  } catch (err) {
    console.error('[VISIT_PING]', err);
    res.status(500).json({success: false, error: 'visit_log_failed'});
  }
});

app.get('/api/admin/stats/visitors', requireAdminSecret, (req, res) => {
  const data = readVisitorStatsRaw();
  const today = getLocalDateKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = formatLocalDateKey(y);
  const todayBucket = normalizeVisitorBucket(data[today]);
  const yesterdayBucket = normalizeVisitorBucket(data[yesterday]);
  const todayUnique = todayBucket.ips.length;
  const yesterdayUnique = yesterdayBucket.ips.length;
  res.json({
    success: true,
    today,
    todayUnique,
    yesterday,
    yesterdayUnique,
    topSourcesToday: summarizeSourceTop(todayBucket, 12),
    topSourcesYesterday: summarizeSourceTop(yesterdayBucket, 12),
    topRegionsToday: summarizeRegionTop(todayBucket, 12),
    topRegionsYesterday: summarizeRegionTop(yesterdayBucket, 12),
  });
});

ensureDir(uploadsRoot);
ensureDir(pdfTempRoot);
ensureDir(timelineVideoTempRoot);
ensureDir(localImportVideoRoot);
ensureDir(localImportPdfRoot);
ensureDir(vibecodingProjectsRoot);
app.use('/uploads', express.static(uploadsRoot));

app.get('/api/data', (req, res) => {
  const raw = readData();
  const data = {
    ...raw,
    timeline: sortTimelineEntries(Array.isArray(raw.timeline) ? raw.timeline : []),
    awards: sortAwardsByDateDesc(Array.isArray(raw.awards) ? raw.awards : []),
    pdfs: sortPdfs(Array.isArray(raw.pdfs) ? raw.pdfs : []),
    journals: sortJournals(Array.isArray(raw.journals) ? raw.journals : []),
    vibecodingProjects: sortVibecodingProjects(Array.isArray(raw.vibecodingProjects) ? raw.vibecodingProjects : []),
  };
  res.json(data);
});

app.post('/api/timeline', requireAdminSecret, (req, res) => {
  const incoming = req.body || {};
  const data = readData();
  const item = {
    ...incoming,
    id: incoming.id || createId('entry_'),
    category: normalizeTimelineCategory(incoming.category),
    contentMode: normalizeContentMode(incoming.contentMode),
    coverAspect: normalizeCoverAspect(incoming.coverAspect),
    videoUrl: typeof incoming.videoUrl === 'string' ? incoming.videoUrl.trim() : '',
    videoSources: normalizeTimelineVideoSources(incoming.videoSources),
    thumbnailImage: typeof incoming.thumbnailImage === 'string' ? incoming.thumbnailImage.trim() : '',
  };
  if (!item.videoUrl && item.videoSources[0]?.url) item.videoUrl = item.videoSources[0].url;
  data.timeline.unshift(item);
  writeData(data);
  res.json({success: true, item});
});

app.put('/api/timeline/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const incoming = req.body || {};
  const data = readData();
  const idx = data.timeline.findIndex((t) => t?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'Timeline item not found'});
    return;
  }
  const nextItem = {
    ...data.timeline[idx],
    ...incoming,
    id,
    category: normalizeTimelineCategory(incoming.category ?? data.timeline[idx]?.category),
    contentMode: normalizeContentMode(incoming.contentMode ?? data.timeline[idx]?.contentMode),
    coverAspect: normalizeCoverAspect(incoming.coverAspect ?? data.timeline[idx]?.coverAspect),
    videoUrl:
      typeof incoming.videoUrl === 'string'
        ? incoming.videoUrl.trim()
        : typeof data.timeline[idx]?.videoUrl === 'string'
          ? data.timeline[idx].videoUrl.trim()
          : '',
    videoSources:
      incoming.videoSources !== undefined
        ? normalizeTimelineVideoSources(incoming.videoSources)
        : normalizeTimelineVideoSources(data.timeline[idx]?.videoSources),
    thumbnailImage:
      typeof incoming.thumbnailImage === 'string'
        ? incoming.thumbnailImage.trim()
        : typeof data.timeline[idx]?.thumbnailImage === 'string'
          ? data.timeline[idx].thumbnailImage.trim()
          : '',
  };
  if (!nextItem.videoUrl && nextItem.videoSources[0]?.url) nextItem.videoUrl = nextItem.videoSources[0].url;
  data.timeline[idx] = nextItem;
  writeData(data);
  res.json({success: true, item: nextItem});
});

app.post('/api/timeline/thumbnail', requireAdminSecret, (req, res) => {
  const {entryId, thumbData} = req.body || {};
  if (!entryId || typeof entryId !== 'string') {
    res.status(400).json({success: false, error: 'entryId is required'});
    return;
  }
  const parsed = parseDataUrl(typeof thumbData === 'string' ? thumbData : '');
  if (!parsed || !allowedImageMimes.has(parsed.mime)) {
    res.status(400).json({success: false, error: 'thumbData is required (image)'}); 
    return;
  }
  if (uploadMaxBytes > 0 && parsed.buffer.length > uploadMaxBytes) {
    res.status(413).json({success: false, error: 'Thumbnail too large'});
    return;
  }

  const data = readData();
  const idx = data.timeline.findIndex((item) => item?.id === entryId);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'Timeline item not found'});
    return;
  }

  const targetDir = path.join(uploadsRoot, 'timeline', entryId);
  ensureDir(targetDir);
  const ext = getExtFromMime(parsed.mime) || '.jpg';
  const fileName = `${createId('entrythumb_')}-thumb${ext}`;
  const absPath = path.join(targetDir, fileName);
  fs.writeFileSync(absPath, parsed.buffer);
  const relativePath = path.join('uploads', 'timeline', entryId, fileName);
  const thumbnailImage = `/${relativePath.replace(/\\/g, '/')}`;

  const prevThumbRel = extractUploadRelativePathFromUrl(data.timeline[idx]?.thumbnailImage);
  if (prevThumbRel) safeUnlink(path.join(__dirname, prevThumbRel));

  data.timeline[idx] = {
    ...data.timeline[idx],
    thumbnailImage,
  };
  writeData(data);
  res.json({success: true, thumbnailImage, item: data.timeline[idx]});
});

app.delete('/api/timeline/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const strategy = req.body?.assetStrategy || req.query.assetStrategy || 'keepAssets';
  const data = readData();
  const idx = data.timeline.findIndex((t) => t?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'Timeline item not found'});
    return;
  }

  data.timeline.splice(idx, 1);
  const relatedAssets = data.assets.filter((a) => a && !a.deleted && a.entryId === id);
  if (strategy === 'deleteAssets') {
    for (const asset of relatedAssets) deleteAssetRecord(asset);
  } else {
    for (const asset of relatedAssets) asset.entryId = null;
  }

  const cleanupSummary = cleanupStorageGarbage(data, {
    mode: 'execute',
    removeOrphanAssetRecords: false,
    removeDeletedAssetFiles: true,
    removeOrphanDiskFiles: false,
    removeEmptyDirs: true,
  });
  data.adminMeta.lastCleanupAt = new Date().toISOString();
  data.adminMeta.lastCleanupSummary = cleanupSummary;
  writeData(data);
  res.json({success: true, id, assetStrategy: strategy, cleanupSummary});
});

app.post('/api/assets/upload', requireAdminSecret, (req, res) => {
  const {entryId, files} = req.body || {};
  if (!entryId || typeof entryId !== 'string') {
    res.status(400).json({success: false, error: 'entryId is required'});
    return;
  }
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({success: false, error: 'files is required'});
    return;
  }

  const targetDir = path.join(uploadsRoot, 'timeline', entryId);
  ensureDir(targetDir);
  const data = readData();
  const createdAssets = [];

  for (const file of files) {
    const parsed = parseDataUrl(file?.data);
    if (!parsed) continue;
    if (!allowedImageMimes.has(parsed.mime)) continue;
    if (uploadMaxBytes > 0 && parsed.buffer.length > uploadMaxBytes) {
      res.status(413).json({success: false, error: 'File too large'});
      return;
    }

    const assetId = createId('asset_');
    const safeBase = sanitizeFileName(file?.name || 'image');
    const ext = getExtFromMime(parsed.mime) || path.extname(safeBase) || '.img';
    const baseName = path.basename(safeBase, path.extname(safeBase));
    const finalName = `${assetId}-${baseName}${ext}`;
    const absPath = path.join(targetDir, finalName);

    fs.writeFileSync(absPath, parsed.buffer);

    const relativePath = path.join('uploads', 'timeline', entryId, finalName);
    const urlPath = `/${relativePath.replace(/\\/g, '/')}`;
    const asset = {
      id: assetId,
      entryId,
      url: urlPath,
      relativePath,
      originalName: file?.name || finalName,
      mime: parsed.mime,
      size: parsed.buffer.length,
      createdAt: new Date().toISOString(),
      deleted: false,
    };
    data.assets.push(asset);
    createdAssets.push(asset);
  }

  writeData(data);
  res.json({success: true, assets: createdAssets});
});

app.post('/api/timeline/video-upload', requireAdminSecret, (req, res, next) => {
  timelineVideoUploadMiddleware.single('video')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({success: false, error: 'File too large'});
      return;
    }
    res.status(400).json({success: false, error: err.message || 'Upload failed'});
  });
}, (req, res) => {
  const entryId = typeof req.body?.entryId === 'string' ? req.body.entryId.trim() : '';
  if (!entryId) {
    safeUnlink(req.file?.path);
    res.status(400).json({success: false, error: 'entryId is required'});
    return;
  }
  const up = req.file;
  if (!up?.path) {
    res.status(400).json({success: false, error: 'video file is required'});
    return;
  }
  const mime = String(up.mimetype || '').toLowerCase();
  if (!isAllowedTimelineVideoUpload(mime, up.originalname || '')) {
    safeUnlink(up.path);
    res.status(400).json({success: false, error: 'Only MP4/WEBM/OGG video is allowed'});
    return;
  }
  if (uploadMaxBytes > 0 && up.size > uploadMaxBytes) {
    safeUnlink(up.path);
    res.status(413).json({success: false, error: 'File too large'});
    return;
  }

  try {
    const targetDir = path.join(uploadsRoot, 'timeline', entryId);
    ensureDir(targetDir);

    const fileId = createId('entryvideo_');
    const safeBase = sanitizeFileName(up.originalname || 'video');
    const ext = getExtFromMime(mime) || path.extname(safeBase) || '.mp4';
    const baseName = path.basename(safeBase, path.extname(safeBase));
    const finalName = `${fileId}-${baseName}${ext}`;
    const absPath = path.join(targetDir, finalName);
    fs.renameSync(up.path, absPath);
    const {defaultUrl, sources} = generateTimelineVideoVariants({
      entryId,
      absPath,
      fileId,
      baseName,
      mime,
      originalName: up.originalname || finalName,
      size: up.size,
    });
    const primarySource = Array.isArray(sources) ? sources.find((item) => item.url === defaultUrl) || sources[0] : null;
    res.json({
      success: true,
      file: {
        url: defaultUrl,
        relativePath: primarySource?.relativePath || '',
        originalName: up.originalname || finalName,
        mime: primarySource?.mime || mime,
        size: primarySource?.size || up.size,
      },
      sources,
    });
  } catch {
    safeUnlink(up.path);
    res.status(500).json({success: false, error: 'Failed to store video file'});
  }
});

app.get('/api/awards', (req, res) => {
  const data = readData();
  const awards = sortAwardsByDateDesc(Array.isArray(data.awards) ? data.awards : []);
  res.json({success: true, awards});
});

app.get('/api/pdfs', (req, res) => {
  const data = readData();
  const pdfs = sortPdfs(Array.isArray(data.pdfs) ? data.pdfs : []);
  res.json({success: true, pdfs});
});

app.get('/api/journals', (req, res) => {
  const data = readData();
  const journals = sortJournals(Array.isArray(data.journals) ? data.journals : []);
  res.json({success: true, journals});
});

app.get('/api/vibecoding', (req, res) => {
  const data = readData();
  const projects = sortVibecodingProjects(Array.isArray(data.vibecodingProjects) ? data.vibecodingProjects : []);
  res.json({success: true, projects});
});

app.get('/api/vibecoding/:slug', (req, res) => {
  const data = readData();
  const slug = slugifyText(req.params.slug || '');
  const project = (Array.isArray(data.vibecodingProjects) ? data.vibecodingProjects : []).find(
    (item) => slugifyText(item?.slug || item?.title || '') === slug,
  );
  if (!project) {
    res.status(404).json({success: false, error: 'VibeCoding project not found'});
    return;
  }
  res.json({success: true, project});
});

app.get('/api/journals/:id', (req, res) => {
  const data = readData();
  const journal = (Array.isArray(data.journals) ? data.journals : []).find((item) => item?.id === req.params.id);
  if (!journal) {
    res.status(404).json({success: false, error: 'Journal not found'});
    return;
  }
  res.json({success: true, journal});
});

app.post('/api/awards', requireAdminSecret, (req, res) => {
  const incoming = req.body || {};
  const data = readData();
  const now = new Date().toISOString();
  const award = {
    id: incoming.id || createId('award_'),
    date: normalizeAwardText(incoming.date),
    title: normalizeAwardText(incoming.title) || 'Untitled Award',
    workTitle: normalizeAwardText(incoming.workTitle),
    certificateNo: normalizeAwardText(incoming.certificateNo),
    projectName: normalizeAwardText(incoming.projectName),
    authorName: normalizeAwardText(incoming.authorName),
    instructorName: normalizeAwardText(incoming.instructorName),
    organizationName: normalizeAwardText(incoming.organizationName),
    awardLevel: normalizeAwardText(incoming.awardLevel),
    organizer: normalizeAwardText(incoming.organizer),
    workEntryIds: Array.isArray(incoming.workEntryIds)
      ? incoming.workEntryIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
      : [],
    image: normalizeAwardText(incoming.image),
    thumbnailImage: normalizeAwardText(incoming.thumbnailImage),
    imageNaturalWidth: Number(incoming.imageNaturalWidth) || undefined,
    imageNaturalHeight: Number(incoming.imageNaturalHeight) || undefined,
    createdAt: now,
    updatedAt: now,
  };
  data.awards.unshift(award);
  writeData(data);
  res.json({success: true, award});
});

app.post('/api/pdfs', requireAdminSecret, (req, res) => {
  const incoming = req.body || {};
  const data = readData();
  const now = new Date().toISOString();
  const pdf = {
    id: incoming.id || createId('pdf_'),
    title: normalizePdfText(incoming.title) || 'Untitled PDF',
    date: normalizePdfText(incoming.date),
    description: normalizePdfText(incoming.description),
    fileUrl: normalizePdfText(incoming.fileUrl),
    relativePath: normalizePdfText(incoming.relativePath),
    coverImage: normalizePdfText(incoming.coverImage),
    size: Number(incoming.size) || 0,
    coverImageNaturalWidth: Number(incoming.coverImageNaturalWidth) || undefined,
    coverImageNaturalHeight: Number(incoming.coverImageNaturalHeight) || undefined,
    pageCount: Number(incoming.pageCount) || undefined,
    order: Number.isFinite(Number(incoming.order)) ? Number(incoming.order) : 0,
    workEntryIds: Array.isArray(incoming.workEntryIds)
      ? incoming.workEntryIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
      : [],
    createdAt: now,
    updatedAt: now,
  };
  data.pdfs.unshift(pdf);
  writeData(data);
  res.json({success: true, pdf});
});

app.post('/api/admin/journals', requireAdminSecret, (req, res) => {
  const incoming = req.body || {};
  const data = readData();
  const now = new Date().toISOString();
  const layout = incoming.layout && typeof incoming.layout === 'object'
    ? incoming.layout
    : {
      version: 1,
      canvas: {width: 1920, height: 1080, bgColor: '#ffffff'},
      elements: [],
    };
  const journal = {
    id: incoming.id || createId('journal_'),
    title: normalizeJournalText(incoming.title) || 'Untitled Journal',
    date: normalizeJournalText(incoming.date),
    note: normalizeJournalText(incoming.note),
    layout,
    coverImage: pickJournalCoverFromLayout(layout, incoming.coverImage),
    createdAt: now,
    updatedAt: now,
  };
  data.journals.unshift(journal);
  writeData(data);
  res.json({success: true, journal});
});

app.get('/api/admin/vibecoding/imports', requireAdminSecret, (req, res) => {
  const imports = listVibecodingImportProjects();
  res.json({success: true, ...imports});
});

app.post('/api/admin/vibecoding', requireAdminSecret, (req, res) => {
  const incoming = req.body || {};
  const projects = readVibecodingProjects();
  const now = new Date().toISOString();
  const built = buildVibecodingProjectRecord({
    incoming,
    existingProjects: projects,
    prev: null,
  });
  if (!built.project) {
    res.status(400).json({success: false, error: built.error || 'Invalid VibeCoding project payload'});
    return;
  }
  const project = {
    ...built.project,
    createdAt: now,
    updatedAt: now,
  };
  writeVibecodingProjects([project, ...projects]);
  res.json({success: true, project});
});

app.put('/api/awards/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const incoming = req.body || {};
  const data = readData();
  const idx = data.awards.findIndex((a) => a?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'Award not found'});
    return;
  }
  const prev = data.awards[idx];
  const next = {
    ...prev,
    ...incoming,
    id,
    date: normalizeAwardText(incoming.date ?? prev.date),
    title: normalizeAwardText(incoming.title ?? prev.title) || 'Untitled Award',
    workTitle: normalizeAwardText(incoming.workTitle ?? prev.workTitle),
    certificateNo: normalizeAwardText(incoming.certificateNo ?? prev.certificateNo),
    projectName: normalizeAwardText(incoming.projectName ?? prev.projectName),
    authorName: normalizeAwardText(incoming.authorName ?? prev.authorName),
    instructorName: normalizeAwardText(incoming.instructorName ?? prev.instructorName),
    organizationName: normalizeAwardText(incoming.organizationName ?? prev.organizationName),
    awardLevel: normalizeAwardText(incoming.awardLevel ?? prev.awardLevel),
    organizer: normalizeAwardText(incoming.organizer ?? prev.organizer),
    image: normalizeAwardText(incoming.image ?? prev.image),
    thumbnailImage: normalizeAwardText(incoming.thumbnailImage ?? prev.thumbnailImage),
    workEntryIds: Array.isArray(incoming.workEntryIds)
      ? incoming.workEntryIds.filter((entryId) => typeof entryId === 'string' && entryId.trim()).map((entryId) => entryId.trim())
      : Array.isArray(prev.workEntryIds)
        ? prev.workEntryIds
        : [],
    updatedAt: new Date().toISOString(),
  };
  data.awards[idx] = next;
  writeData(data);
  res.json({success: true, award: next});
});

app.put('/api/pdfs/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const incoming = req.body || {};
  const data = readData();
  const idx = data.pdfs.findIndex((p) => p?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'PDF not found'});
    return;
  }
  const prev = data.pdfs[idx];
  const next = {
    ...prev,
    ...incoming,
    id,
    title: normalizePdfText(incoming.title ?? prev.title) || 'Untitled PDF',
    date: normalizePdfText(incoming.date ?? prev.date),
    description: normalizePdfText(incoming.description ?? prev.description),
    fileUrl: normalizePdfText(incoming.fileUrl ?? prev.fileUrl),
    relativePath: normalizePdfText(incoming.relativePath ?? prev.relativePath),
    coverImage: normalizePdfText(incoming.coverImage ?? prev.coverImage),
    size: Number(incoming.size ?? prev.size) || 0,
    coverImageNaturalWidth: Number(incoming.coverImageNaturalWidth ?? prev.coverImageNaturalWidth) || undefined,
    coverImageNaturalHeight: Number(incoming.coverImageNaturalHeight ?? prev.coverImageNaturalHeight) || undefined,
    pageCount: Number(incoming.pageCount ?? prev.pageCount) || undefined,
    order: Number.isFinite(Number(incoming.order ?? prev.order)) ? Number(incoming.order ?? prev.order) : 0,
    workEntryIds: Array.isArray(incoming.workEntryIds)
      ? incoming.workEntryIds.filter((entryId) => typeof entryId === 'string' && entryId.trim()).map((entryId) => entryId.trim())
      : Array.isArray(prev.workEntryIds)
        ? prev.workEntryIds
        : [],
    updatedAt: new Date().toISOString(),
  };
  data.pdfs[idx] = next;
  writeData(data);
  res.json({success: true, pdf: next});
});

app.put('/api/admin/journals/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const incoming = req.body || {};
  const data = readData();
  const idx = data.journals.findIndex((item) => item?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'Journal not found'});
    return;
  }
  const prev = data.journals[idx];
  const layout = incoming.layout && typeof incoming.layout === 'object'
    ? incoming.layout
    : prev.layout;
  const next = {
    ...prev,
    ...incoming,
    id,
    title: normalizeJournalText(incoming.title ?? prev.title) || 'Untitled Journal',
    date: normalizeJournalText(incoming.date ?? prev.date),
    note: normalizeJournalText(incoming.note ?? prev.note),
    layout,
    coverImage: pickJournalCoverFromLayout(layout, incoming.coverImage ?? prev.coverImage),
    updatedAt: new Date().toISOString(),
  };
  data.journals[idx] = next;
  writeData(data);
  res.json({success: true, journal: next});
});

app.put('/api/admin/vibecoding/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const incoming = req.body || {};
  const projects = readVibecodingProjects();
  const idx = projects.findIndex((item) => item?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'VibeCoding project not found'});
    return;
  }
  const prev = projects[idx];
  const built = buildVibecodingProjectRecord({
    incoming,
    existingProjects: projects,
    prev,
  });
  if (!built.project) {
    res.status(400).json({success: false, error: built.error || 'Invalid VibeCoding project payload'});
    return;
  }
  const next = {
    ...built.project,
    createdAt: prev.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const nextProjects = [...projects];
  nextProjects[idx] = next;
  writeVibecodingProjects(nextProjects);
  res.json({success: true, project: next});
});

app.delete('/api/awards/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const data = readData();
  const idx = data.awards.findIndex((a) => a?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'Award not found'});
    return;
  }
  data.awards.splice(idx, 1);
  const awardDir = path.join(uploadsRoot, 'awards', id);
  if (fs.existsSync(awardDir)) {
    fs.rmSync(awardDir, {recursive: true, force: true});
  }
  const cleanupSummary = cleanupStorageGarbage(data, {
    mode: 'execute',
    removeOrphanAssetRecords: false,
    removeDeletedAssetFiles: true,
    removeOrphanDiskFiles: true,
    removeEmptyDirs: true,
  });
  data.adminMeta.lastCleanupAt = new Date().toISOString();
  data.adminMeta.lastCleanupSummary = cleanupSummary;
  writeData(data);
  res.json({success: true, id, cleanupSummary});
});

app.delete('/api/pdfs/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const data = readData();
  const idx = data.pdfs.findIndex((p) => p?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'PDF not found'});
    return;
  }
  data.pdfs.splice(idx, 1);
  const pdfDir = path.join(uploadsRoot, 'pdfs', id);
  if (fs.existsSync(pdfDir)) {
    fs.rmSync(pdfDir, {recursive: true, force: true});
  }
  const cleanupSummary = cleanupStorageGarbage(data, {
    mode: 'execute',
    removeOrphanAssetRecords: false,
    removeDeletedAssetFiles: true,
    removeOrphanDiskFiles: true,
    removeEmptyDirs: true,
  });
  data.adminMeta.lastCleanupAt = new Date().toISOString();
  data.adminMeta.lastCleanupSummary = cleanupSummary;
  writeData(data);
  res.json({success: true, id, cleanupSummary});
});

app.delete('/api/admin/journals/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const data = readData();
  const idx = data.journals.findIndex((item) => item?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'Journal not found'});
    return;
  }
  data.journals.splice(idx, 1);
  const journalDir = path.join(uploadsRoot, 'journals', id);
  if (fs.existsSync(journalDir)) {
    fs.rmSync(journalDir, {recursive: true, force: true});
  }
  const cleanupSummary = cleanupStorageGarbage(data, {
    mode: 'execute',
    removeOrphanAssetRecords: false,
    removeDeletedAssetFiles: true,
    removeOrphanDiskFiles: true,
    removeEmptyDirs: true,
  });
  data.adminMeta.lastCleanupAt = new Date().toISOString();
  data.adminMeta.lastCleanupSummary = cleanupSummary;
  writeData(data);
  res.json({success: true, id, cleanupSummary});
});

app.delete('/api/admin/vibecoding/:id', requireAdminSecret, (req, res) => {
  const id = req.params.id;
  const projects = readVibecodingProjects();
  const idx = projects.findIndex((item) => item?.id === id);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'VibeCoding project not found'});
    return;
  }
  const nextProjects = [...projects];
  nextProjects.splice(idx, 1);
  writeVibecodingProjects(nextProjects);
  res.json({success: true, id});
});

app.post('/api/awards/thumbnail', requireAdminSecret, (req, res) => {
  const {awardId, thumbData} = req.body || {};
  if (!awardId || typeof awardId !== 'string') {
    res.status(400).json({success: false, error: 'awardId is required'});
    return;
  }
  const parsed = parseDataUrl(typeof thumbData === 'string' ? thumbData : '');
  if (!parsed || !allowedAwardImageMimes.has(parsed.mime)) {
    res.status(400).json({success: false, error: 'thumbData is required (png/jpg)'});
    return;
  }
  if (uploadMaxBytes > 0 && parsed.buffer.length > uploadMaxBytes) {
    res.status(413).json({success: false, error: 'Thumbnail too large'});
    return;
  }

  const data = readData();
  const idx = data.awards.findIndex((a) => a?.id === awardId);
  if (idx === -1) {
    res.status(404).json({success: false, error: 'Award not found'});
    return;
  }

  const targetDir = path.join(uploadsRoot, 'awards', awardId);
  ensureDir(targetDir);
  const ext = getExtFromMime(parsed.mime) || '.jpg';
  const fileName = `${createId('awardthumb_')}-thumb${ext}`;
  const absPath = path.join(targetDir, fileName);
  fs.writeFileSync(absPath, parsed.buffer);
  const relativePath = path.join('uploads', 'awards', awardId, fileName);
  const thumbnailImage = `/${relativePath.replace(/\\/g, '/')}`;

  const prevThumbRel = extractUploadRelativePathFromUrl(data.awards[idx]?.thumbnailImage);
  if (prevThumbRel) safeUnlink(path.join(__dirname, prevThumbRel));

  data.awards[idx] = {
    ...data.awards[idx],
    thumbnailImage,
    updatedAt: new Date().toISOString(),
  };
  writeData(data);
  res.json({success: true, thumbnailImage, award: data.awards[idx]});
});

app.post('/api/awards/upload', requireAdminSecret, (req, res) => {
  const {awardId, files} = req.body || {};
  if (!awardId || typeof awardId !== 'string') {
    res.status(400).json({success: false, error: 'awardId is required'});
    return;
  }
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({success: false, error: 'files is required'});
    return;
  }

  const targetDir = path.join(uploadsRoot, 'awards', awardId);
  ensureDir(targetDir);
  const uploaded = [];

  for (const file of files) {
    const parsed = parseDataUrl(file?.data);
    if (!parsed) continue;
    if (!allowedAwardImageMimes.has(parsed.mime)) continue;
    if (uploadMaxBytes > 0 && parsed.buffer.length > uploadMaxBytes) {
      res.status(413).json({success: false, error: 'File too large'});
      return;
    }

    const fileId = createId('awardimg_');
    const safeBase = sanitizeFileName(file?.name || 'award');
    const ext = getExtFromMime(parsed.mime) || path.extname(safeBase) || '.img';
    const baseName = path.basename(safeBase, path.extname(safeBase));
    const finalName = `${fileId}-${baseName}${ext}`;
    const absPath = path.join(targetDir, finalName);
    fs.writeFileSync(absPath, parsed.buffer);

    const relativePath = path.join('uploads', 'awards', awardId, finalName);
    const urlPath = `/${relativePath.replace(/\\/g, '/')}`;
    const dimensions = extractImageSize(parsed.buffer, parsed.mime);
    let thumbnailImage = '';
    let thumbnailRelativePath = '';
    const thumbParsed = parseDataUrl(typeof file?.thumbData === 'string' ? file.thumbData : '');
    if (thumbParsed && allowedAwardImageMimes.has(thumbParsed.mime)) {
      if (uploadMaxBytes > 0 && thumbParsed.buffer.length > uploadMaxBytes) {
        res.status(413).json({success: false, error: 'Thumbnail too large'});
        return;
      }
      const thumbExt = getExtFromMime(thumbParsed.mime) || '.jpg';
      const thumbName = `${fileId}-${baseName}-thumb${thumbExt}`;
      const thumbAbsPath = path.join(targetDir, thumbName);
      fs.writeFileSync(thumbAbsPath, thumbParsed.buffer);
      thumbnailRelativePath = path.join('uploads', 'awards', awardId, thumbName);
      thumbnailImage = `/${thumbnailRelativePath.replace(/\\/g, '/')}`;
    }
    uploaded.push({
      url: urlPath,
      relativePath,
      originalName: file?.name || finalName,
      mime: parsed.mime,
      size: parsed.buffer.length,
      thumbnailImage,
      thumbnailRelativePath,
      imageNaturalWidth: dimensions?.width,
      imageNaturalHeight: dimensions?.height,
    });
  }

  res.json({success: true, files: uploaded});
});

app.post('/api/pdfs/upload', requireAdminSecret, (req, res, next) => {
  pdfUploadMiddleware.single('pdf')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({success: false, error: 'File too large'});
      return;
    }
    res.status(400).json({success: false, error: err.message || 'Upload failed'});
  });
}, (req, res) => {
  const pdfId = req.body?.pdfId;
  if (!pdfId || typeof pdfId !== 'string') {
    safeUnlink(req.file?.path);
    res.status(400).json({success: false, error: 'pdfId is required'});
    return;
  }
  const up = req.file;
  if (!up?.path) {
    res.status(400).json({success: false, error: 'pdf file is required'});
    return;
  }
  const mime = up.mimetype || '';
  if (!allowedPdfMimes.has(mime)) {
    safeUnlink(up.path);
    res.status(400).json({success: false, error: 'Only PDF file is allowed'});
    return;
  }
  if (uploadMaxBytes > 0 && up.size > uploadMaxBytes) {
    safeUnlink(up.path);
    res.status(413).json({success: false, error: 'File too large'});
    return;
  }

  try {
    const targetDir = path.join(uploadsRoot, 'pdfs', pdfId);
    ensureDir(targetDir);

    const fileId = createId('pdfbin_');
    const safeBase = sanitizeFileName(up.originalname || 'portfolio.pdf');
    const ext = getExtFromMime(mime) || path.extname(safeBase) || '.pdf';
    const baseName = path.basename(safeBase, path.extname(safeBase));
    const finalName = `${fileId}-${baseName}${ext}`;
    const absPath = path.join(targetDir, finalName);
    fs.renameSync(up.path, absPath);

    const relativePath = path.join('uploads', 'pdfs', pdfId, finalName);
    const urlPath = `/${relativePath.replace(/\\/g, '/')}`;
    res.json({
      success: true,
      file: {
        url: urlPath,
        relativePath,
        originalName: up.originalname || finalName,
        mime,
        size: up.size,
      },
    });
  } catch {
    safeUnlink(up.path);
    res.status(500).json({success: false, error: 'Failed to store PDF file'});
  }
});

app.post('/api/pdfs/cover-upload', requireAdminSecret, (req, res) => {
  const {pdfId, files} = req.body || {};
  if (!pdfId || typeof pdfId !== 'string') {
    res.status(400).json({success: false, error: 'pdfId is required'});
    return;
  }
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({success: false, error: 'files is required'});
    return;
  }

  const targetDir = path.join(uploadsRoot, 'pdfs', pdfId);
  ensureDir(targetDir);

  const uploaded = [];
  for (const file of files) {
    if (!file?.data) continue;
    const parsed = parseDataUrl(file.data);
    if (!parsed) continue;
    if (!allowedPdfCoverImageMimes.has(parsed.mime)) continue;
    if (uploadMaxBytes > 0 && parsed.buffer.length > uploadMaxBytes) {
      res.status(413).json({success: false, error: 'File too large'});
      return;
    }

    const fileId = createId('pdfcover_');
    const safeBase = sanitizeFileName(file?.name || 'pdf-cover');
    const ext = getExtFromMime(parsed.mime) || path.extname(safeBase) || '.img';
    const baseName = path.basename(safeBase, path.extname(safeBase));
    const finalName = `${fileId}-${baseName}${ext}`;
    const absPath = path.join(targetDir, finalName);
    fs.writeFileSync(absPath, parsed.buffer);

    const relativePath = path.join('uploads', 'pdfs', pdfId, finalName);
    const urlPath = `/${relativePath.replace(/\\/g, '/')}`;
    const dimensions = extractImageSize(parsed.buffer, parsed.mime);
    uploaded.push({
      url: urlPath,
      relativePath,
      originalName: file?.name || finalName,
      mime: parsed.mime,
      size: parsed.buffer.length,
      imageNaturalWidth: dimensions?.width,
      imageNaturalHeight: dimensions?.height,
    });
  }

  res.json({success: true, files: uploaded});
});

app.post('/api/admin/journals/upload', requireAdminSecret, (req, res) => {
  const {journalId, files} = req.body || {};
  if (!journalId || typeof journalId !== 'string') {
    res.status(400).json({success: false, error: 'journalId is required'});
    return;
  }
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({success: false, error: 'files is required'});
    return;
  }

  const targetDir = path.join(uploadsRoot, 'journals', journalId);
  ensureDir(targetDir);

  const uploaded = [];
  for (const file of files) {
    if (!file?.data) continue;
    const parsed = parseDataUrl(file.data);
    if (!parsed) continue;
    if (!allowedJournalImageMimes.has(parsed.mime)) continue;
    if (uploadMaxBytes > 0 && parsed.buffer.length > uploadMaxBytes) {
      res.status(413).json({success: false, error: 'File too large'});
      return;
    }

    const fileId = createId('journalimg_');
    const safeBase = sanitizeFileName(file?.name || 'journal');
    const ext = getExtFromMime(parsed.mime) || path.extname(safeBase) || '.img';
    const baseName = path.basename(safeBase, path.extname(safeBase));
    const finalName = `${fileId}-${baseName}${ext}`;
    const absPath = path.join(targetDir, finalName);
    fs.writeFileSync(absPath, parsed.buffer);

    const relativePath = path.join('uploads', 'journals', journalId, finalName);
    const urlPath = `/${relativePath.replace(/\\/g, '/')}`;
    const dimensions = extractImageSize(parsed.buffer, parsed.mime);
    uploaded.push({
      id: fileId,
      url: urlPath,
      relativePath,
      originalName: file?.name || finalName,
      mime: parsed.mime,
      size: parsed.buffer.length,
      imageNaturalWidth: dimensions?.width,
      imageNaturalHeight: dimensions?.height,
    });
  }

  res.json({success: true, files: uploaded});
});

app.get('/api/assets', (req, res) => {
  const data = readData();
  let assets = data.assets.filter((a) => a && !a.deleted);

  const {entryId, orphan} = req.query;
  if (entryId && typeof entryId === 'string') {
    assets = assets.filter((a) => a.entryId === entryId);
  }

  if (String(orphan) === 'true') {
    const referenced = collectReferencedAssetIds(data);
    assets = assets.filter((a) => !referenced.has(a.id));
  }

  res.json({success: true, assets});
});

app.delete('/api/assets/:assetId', requireAdminSecret, (req, res) => {
  const assetId = req.params.assetId;
  const force = String(req.query.force) === 'true';
  const data = readData();
  const asset = findAsset(data, assetId);
  if (!asset) {
    res.status(404).json({success: false, error: 'Asset not found'});
    return;
  }

  if (!force) {
    const referenced = collectReferencedAssetIds(data);
    if (referenced.has(assetId)) {
      res.status(409).json({success: false, error: 'Asset is still referenced'});
      return;
    }
  }

  deleteAssetRecord(asset);
  writeData(data);
  res.json({success: true, assetId});
});

app.get('/api/admin/storage/audit', requireAdminSecret, (req, res) => {
  const data = readData();
  const audit = computeStorageAudit(data);
  res.json({success: true, audit});
});

app.post('/api/admin/storage/cleanup', requireAdminSecret, (req, res) => {
  const data = readData();
  const mode = req.body?.mode === 'dry-run' ? 'dry-run' : 'execute';
  const summary = cleanupStorageGarbage(data, {...(req.body || {}), mode});
  if (mode === 'execute') {
    data.adminMeta.lastCleanupAt = new Date().toISOString();
    data.adminMeta.lastCleanupSummary = summary;
    writeData(data);
  }
  const audit = computeStorageAudit(mode === 'execute' ? readData() : data);
  res.json({success: true, summary, audit});
});

app.get('/api/admin/local-import/files', requireAdminSecret, (req, res) => {
  const listed = listLocalImportFiles(req.query?.kind);
  if (!listed) {
    res.status(400).json({success: false, error: 'kind must be video or pdf'});
    return;
  }
  res.json({
    success: true,
    kind: listed.kind,
    folder: listed.folder,
    files: listed.files,
  });
});

app.post('/api/cows', (req, res) => {
  const newCowData = req.body;
  const data = readData();
  data.cows.push(newCowData);
  writeData(data);
  res.json({success: true, cow: newCowData});
});

app.delete('/api/cows/:id', (req, res) => {
  const cowId = req.params.id;
  const data = readData();
  data.cows = data.cows.filter((c) => c.id !== cowId);
  writeData(data);
  res.json({success: true, id: cowId});
});

app.get('/api/proposal/annotations', (req, res) => {
  res.json(readProposalAnnotations());
});

app.put('/api/proposal/annotations', (req, res) => {
  const saved = writeProposalAnnotations(req.body?.annotations);
  broadcastProposalAnnotations(saved);
  res.json(saved);
});

if (fs.existsSync(distRoot)) {
  app.use(express.static(distRoot));
  app.get(['/', /^\/(?:awards|pdfs|journal|admin|proposal|vibecoding(?:\/[^/]+)?)$/], (req, res) => {
    res.sendFile(path.join(distRoot, 'index.html'));
  });
}

const PORT = 3001;
const server = http.createServer(app);
const proposalWss = new WebSocketServer({server, path: '/api/proposal/live'});

const broadcastProposalAnnotations = (payload) => {
  const message = JSON.stringify({type: 'snapshot', payload});
  for (const client of proposalWss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
};

proposalWss.on('connection', (socket) => {
  socket.send(JSON.stringify({type: 'snapshot', payload: readProposalAnnotations()}));
});

server.listen(PORT, () => {
  if ((process.env.ADMIN_SECRET || '').trim()) {
    console.log('Admin auth mode: ENV ADMIN_SECRET');
  } else {
    console.log(`Admin auth mode: FALLBACK secret (${FALLBACK_ADMIN_SECRET})`);
  }
  if (uploadMaxBytes > 0) {
    console.log(`Upload file limit: ${maxUploadMb}MB per file`);
  } else {
    console.log('Upload file limit: disabled');
  }
  console.log(`JSON request limit: ${Math.max(50, maxRequestMb)}MB`);
  console.log(
    `PDF multipart limit: ${pdfMulterLimitBytes / (1024 * 1024)}MB (set MAX_PDF_UPLOAD_MB when MAX_UPLOAD_MB is 0)`,
  );
  console.log(
    `Timeline video multipart limit: ${timelineVideoMulterLimitBytes / (1024 * 1024)}MB (set MAX_TIMELINE_VIDEO_UPLOAD_MB when MAX_UPLOAD_MB is 0)`,
  );
  console.log(`Local import video folder: ${localImportVideoRoot}`);
  console.log(`Local import PDF folder: ${localImportPdfRoot}`);
  console.log(`VibeCoding project folder: ${vibecodingProjectsRoot}`);
  console.log(`VibeCoding data file: ${vibecodingProjectsFile}`);
  console.log(`Backend Server running on http://localhost:${PORT}`);
});
