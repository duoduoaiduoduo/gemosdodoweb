import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  adminApi,
  type ApiError,
  type LocalImportFile,
  type UploadProgress,
  type VibecodingImportProject,
  type VibecodingProject,
} from './adminApi';

type Category = 'project' | 'video' | 'edu';
type ContentMode = 'whiteboard' | 'flow';
type CoverAspect = '3:4' | '4:3' | '1:1' | '16:9' | '9:16';

type LayoutCanvas = {
  width: number;
  height: number;
  bgColor?: string;
};

type LayoutTextStyle = {
  color: string;
  fontSize: number;
  fontWeight: number;
};

type LayoutImageStyle = {
  fit: 'cover' | 'contain';
  radius: number;
};

type LayoutTextElement = {
  id: string;
  type: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation: number;
  content: string;
  style: LayoutTextStyle;
};

type LayoutImageElement = {
  id: string;
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation: number;
  assetId?: string;
  url: string;
  style: LayoutImageStyle;
};

type LayoutElement = LayoutTextElement | LayoutImageElement;

type EntryLayout = {
  version: 1;
  canvas: LayoutCanvas;
  elements: LayoutElement[];
};

type Entry = {
  id: string;
  category: Category;
  date: string;
  title: string;
  titleEn?: string;
  desc: string;
  descEn?: string;
  videoUrl?: string;
  videoSources?: VideoSource[];
  image?: string;
  thumbnailImage?: string;
  logo?: string;
  contentMode?: ContentMode;
  coverAspect?: CoverAspect;
  layout?: EntryLayout;
  blocks?: FlowBlock[];
};

type Asset = {
  id: string;
  entryId: string | null;
  url: string;
  relativePath: string;
  originalName: string;
  mime: string;
  size: number;
  createdAt: string;
  deleted?: boolean;
};

type StorageAudit = {
  uploadRoot: string;
  totalAssetRecords: number;
  liveAssetRecords: number;
  deletedAssetRecords: number;
  orphanAssetRecords: number;
  deletedAssetFiles: number;
  totalUploadFiles: number;
  timelineUploadFiles: number;
  awardUploadFiles: number;
  pdfUploadFiles?: number;
  journalUploadFiles?: number;
  orphanDiskFiles: number;
  emptyDirsEstimated: number;
  lastCleanupAt?: string | null;
  lastCleanupSummary?: {
    mode?: 'dry-run' | 'execute';
    removedOrphanAssetRecords?: number;
    removedDeletedAssetFiles?: number;
    removedOrphanDiskFiles?: number;
    removedEmptyDirs?: number;
  } | null;
};

type VisitorRegionStat = {
  key: string;
  label: string;
  count: number;
  ratio: number;
};

type AdminAuthState = {
  authorized: boolean;
  adminSecret: string;
};

type Cow = {
  id: string;
  name: string;
};

type Award = {
  id: string;
  date: string;
  title: string;
  workTitle?: string;
  certificateNo?: string;
  projectName?: string;
  authorName?: string;
  instructorName?: string;
  organizationName?: string;
  awardLevel?: string;
  organizer?: string;
  workEntryIds: string[];
  image: string;
  thumbnailImage?: string;
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
  createdAt?: string;
  updatedAt?: string;
};

type DraftEntry = {
  id: string;
  category: Category;
  date: string;
  title: string;
  titleEn: string;
  desc: string;
  descEn: string;
  videoUrl: string;
  videoSources: VideoSource[];
  image: string;
  thumbnailImage: string;
  logo: string;
  contentMode: ContentMode;
  coverAspect: CoverAspect;
  layout: EntryLayout;
  blocks: FlowBlock[];
};

type FlowTextBlock = {
  type: 'text';
  content: string;
  contentEn?: string;
};

type FlowImageBlock = {
  type: 'image';
  url: string;
  assetId?: string;
  caption?: string;
  captionEn?: string;
};

type FlowBlock = FlowTextBlock | FlowImageBlock;

type VideoSource = {
  label: string;
  url: string;
  relativePath?: string;
  mime?: string;
  size?: number;
  height?: number;
  width?: number;
  bitrateKbps?: number;
  isOriginal?: boolean;
};

type AwardDraft = {
  id: string;
  date: string;
  title: string;
  workTitle: string;
  certificateNo: string;
  projectName: string;
  authorName: string;
  instructorName: string;
  organizationName: string;
  awardLevel: string;
  organizer: string;
  workEntryIds: string[];
  image: string;
  thumbnailImage: string;
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
};

type PdfPortfolio = {
  id: string;
  title: string;
  date?: string;
  description?: string;
  fileUrl: string;
  relativePath: string;
  size: number;
  pageCount?: number;
  coverImage?: string;
  coverImageNaturalWidth?: number;
  coverImageNaturalHeight?: number;
  workEntryIds: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
};

type PdfDraft = {
  id: string;
  title: string;
  date: string;
  description: string;
  fileUrl: string;
  relativePath: string;
  size: number;
  pageCount?: number;
  coverImage: string;
  coverImageNaturalWidth?: number;
  coverImageNaturalHeight?: number;
  workEntryIds: string[];
  order: number;
};

type VibecodingDraft = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage: string;
  entryUrl: string;
  entryRelativePath: string;
  projectRootRelativePath: string;
};

type JournalRecord = {
  id: string;
  title: string;
  date?: string;
  note?: string;
  coverImage?: string;
  layout?: EntryLayout;
  createdAt?: string;
  updatedAt?: string;
};

type UploadCardState = UploadProgress & {
  fileName: string;
  phase: 'preparing' | 'uploading';
};

type DragAction =
  | {
    mode: 'move';
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }
  | {
    mode: 'resize';
    id: string;
    startX: number;
    startY: number;
    originW: number;
    originH: number;
    originX: number;
    originY: number;
  };

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const GRID = 8;
const ADMIN_SESSION_KEY = 'gemosdodoweb_admin_session_v1';
const COVER_ASPECT_OPTIONS: CoverAspect[] = ['3:4', '4:3', '1:1', '16:9', '9:16'];
const DEFAULT_COVER_ASPECT: CoverAspect = '3:4';

const normalizeCoverAspect = (value: unknown): CoverAspect =>
  COVER_ASPECT_OPTIONS.includes(value as CoverAspect)
    ? (value as CoverAspect)
    : DEFAULT_COVER_ASPECT;

function CommitNumberInput({
  value,
  onCommit,
  min,
  max,
  step,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    let next = parsed;
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);
    if (typeof step === 'number' && step > 0) next = Math.round(next / step) * step;
    onCommit(next);
    setText(String(next));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Date.now()}_${Math.floor(Math.random() * 10000)}`;
};

const snap = (value: number) => Math.round(value / GRID) * GRID;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const createEmptyLayout = (): EntryLayout => ({
  version: 1,
  canvas: { width: CANVAS_W, height: CANVAS_H, bgColor: '#ffffff' },
  elements: [],
});

const blocksToLayout = (blocks: any[]): EntryLayout => {
  if (!Array.isArray(blocks) || blocks.length === 0) return createEmptyLayout();
  let yCursor = 40;
  const elements: LayoutElement[] = [];
  let z = 1;

  for (const block of blocks) {
    if (block?.type === 'text' && block.content) {
      elements.push({
        id: createId('el_'),
        type: 'text',
        x: 80,
        y: yCursor,
        w: 1760,
        h: 180,
        z: z++,
        rotation: 0,
        content: String(block.content),
        style: { color: '#111111', fontSize: 30, fontWeight: 500 },
      });
      yCursor += 220;
    } else if (block?.type === 'image' && block.url) {
      elements.push({
        id: createId('el_'),
        type: 'image',
        x: 120,
        y: yCursor,
        w: 1680,
        h: 460,
        z: z++,
        rotation: 0,
        url: String(block.url),
        style: { fit: 'cover', radius: 20 },
      });
      yCursor += 500;
    } else if (block?.type === 'gallery' && Array.isArray(block.urls)) {
      const urls = block.urls.slice(0, 6);
      urls.forEach((url: string, idx: number) => {
        elements.push({
          id: createId('el_'),
          type: 'image',
          x: 120 + (idx % 3) * 560,
          y: yCursor + Math.floor(idx / 3) * 300,
          w: 520,
          h: 280,
          z: z++,
          rotation: 0,
          url: String(url),
          style: { fit: 'cover', radius: 16 },
        });
      });
      yCursor += 620;
    }
  }

  return {
    version: 1,
    canvas: { width: CANVAS_W, height: Math.max(CANVAS_H, yCursor + 80), bgColor: '#ffffff' },
    elements,
  };
};

const normalizeLayout = (layout: any, fallbackBlocks: any[] = []): EntryLayout => {
  if (!layout || layout.version !== 1 || !Array.isArray(layout.elements)) {
    return blocksToLayout(fallbackBlocks);
  }
  const width = Number(layout.canvas?.width) || CANVAS_W;
  const height = Number(layout.canvas?.height) || CANVAS_H;
  const bgColor = layout.canvas?.bgColor || '#ffffff';

  const elements = layout.elements
    .filter(Boolean)
    .map((el: any, idx: number) => {
      const common = {
        id: el.id || createId('el_'),
        x: Number(el.x) || 0,
        y: Number(el.y) || 0,
        w: Math.max(40, Number(el.w) || 240),
        h: Math.max(40, Number(el.h) || 120),
        z: Number.isFinite(el.z) ? Number(el.z) : idx + 1,
        rotation: Number(el.rotation) || 0,
      };

      if (el.type === 'image') {
        return {
          ...common,
          type: 'image',
          assetId: el.assetId,
          url: el.url || '',
          style: {
            fit: el.style?.fit === 'contain' ? 'contain' : 'cover',
            radius: Number(el.style?.radius) || 0,
          },
        } as LayoutImageElement;
      }

      return {
        ...common,
        type: 'text',
        content: el.content || '',
        style: {
          color: el.style?.color || '#111111',
          fontSize: Math.max(12, Number(el.style?.fontSize) || 32),
          fontWeight: Number(el.style?.fontWeight) || 500,
        },
      } as LayoutTextElement;
    });

  return {
    version: 1,
    canvas: { width, height, bgColor },
    elements,
  };
};

const createEmptyDraft = (): DraftEntry => ({
  id: createId('entry_'),
  category: 'project',
  date: '',
  title: '',
  titleEn: '',
  desc: '',
  descEn: '',
  videoUrl: '',
  videoSources: [],
  image: '',
  thumbnailImage: '',
  logo: '',
  contentMode: 'whiteboard',
  coverAspect: DEFAULT_COVER_ASPECT,
  layout: createEmptyLayout(),
  blocks: [],
});

const draftFromEntry = (entry: Entry): DraftEntry => ({
  id: entry.id,
  category: entry.category,
  date: entry.date || '',
  title: entry.title || '',
  titleEn: entry.titleEn || '',
  desc: entry.desc || '',
  descEn: entry.descEn || '',
  videoUrl: entry.videoUrl || '',
  videoSources: Array.isArray(entry.videoSources) ? entry.videoSources : [],
  image: entry.image || '',
  thumbnailImage: entry.thumbnailImage || '',
  logo: entry.logo || '',
  contentMode: entry.contentMode === 'flow' ? 'flow' : 'whiteboard',
  coverAspect: normalizeCoverAspect(entry.coverAspect),
  layout: normalizeLayout(entry.layout, entry.blocks || []),
  blocks: Array.isArray(entry.blocks) ? entry.blocks : [],
});

const buildPayloadFromDraft = (draft: DraftEntry): Entry => ({
  id: draft.id,
  category: draft.category,
  date: draft.date.trim() || 'Now',
  title: draft.title.trim() || 'Untitled',
  titleEn: draft.titleEn.trim(),
  desc: draft.desc.trim(),
  descEn: draft.descEn.trim(),
  videoUrl: draft.videoUrl.trim(),
  videoSources: Array.isArray(draft.videoSources) ? draft.videoSources : [],
  image: draft.image.trim(),
  thumbnailImage: String(draft.thumbnailImage || '').trim(),
  logo: draft.logo.trim(),
  contentMode: draft.contentMode,
  coverAspect: draft.coverAspect,
  layout: draft.layout,
  blocks: draft.blocks || [],
});

const createEmptyAwardDraft = (): AwardDraft => ({
  id: createId('award_'),
  date: '',
  title: '',
  workTitle: '',
  certificateNo: '',
  projectName: '',
  authorName: '',
  instructorName: '',
  organizationName: '',
  awardLevel: '',
  organizer: '',
  workEntryIds: [],
  image: '',
  thumbnailImage: '',
  imageNaturalWidth: undefined,
  imageNaturalHeight: undefined,
});

const draftFromAward = (award: Award): AwardDraft => ({
  id: award.id,
  date: award.date || '',
  title: award.title || '',
  workTitle: award.workTitle || '',
  certificateNo: award.certificateNo || '',
  projectName: award.projectName || '',
  authorName: award.authorName || '',
  instructorName: award.instructorName || '',
  organizationName: award.organizationName || '',
  awardLevel: award.awardLevel || '',
  organizer: award.organizer || '',
  workEntryIds: Array.isArray(award.workEntryIds) ? award.workEntryIds : [],
  image: award.image || '',
  thumbnailImage: award.thumbnailImage || '',
  imageNaturalWidth: award.imageNaturalWidth,
  imageNaturalHeight: award.imageNaturalHeight,
});

const createEmptyPdfDraft = (): PdfDraft => ({
  id: createId('pdf_'),
  title: '',
  date: '',
  description: '',
  fileUrl: '',
  relativePath: '',
  size: 0,
  pageCount: undefined,
  coverImage: '',
  coverImageNaturalWidth: undefined,
  coverImageNaturalHeight: undefined,
  workEntryIds: [],
  order: 0,
});

const draftFromPdf = (pdf: PdfPortfolio): PdfDraft => ({
  id: pdf.id,
  title: pdf.title || '',
  date: pdf.date || '',
  description: pdf.description || '',
  fileUrl: pdf.fileUrl || '',
  relativePath: pdf.relativePath || '',
  size: Number(pdf.size) || 0,
  pageCount: pdf.pageCount,
  coverImage: pdf.coverImage || '',
  coverImageNaturalWidth: pdf.coverImageNaturalWidth,
  coverImageNaturalHeight: pdf.coverImageNaturalHeight,
  workEntryIds: Array.isArray(pdf.workEntryIds) ? pdf.workEntryIds : [],
  order: Number.isFinite(Number(pdf.order)) ? Number(pdf.order) : 0,
});

const createEmptyVibecodingDraft = (): VibecodingDraft => ({
  id: createId('vibe_'),
  slug: '',
  title: '',
  description: '',
  coverImage: '',
  entryUrl: '',
  entryRelativePath: '',
  projectRootRelativePath: '',
});

const draftFromVibecodingProject = (project: VibecodingProject): VibecodingDraft => ({
  id: project.id,
  slug: project.slug || '',
  title: project.title || '',
  description: project.description || '',
  coverImage: project.coverImage || '',
  entryUrl: project.entryUrl || '',
  entryRelativePath: project.entryRelativePath || '',
  projectRootRelativePath: project.projectRootRelativePath || '',
});

const createEmptyJournalEditorDraft = (): DraftEntry => ({
  id: createId('journal_'),
  category: 'project',
  date: '',
  title: '',
  titleEn: '',
  desc: '',
  descEn: '',
  videoUrl: '',
  videoSources: [],
  image: '',
  thumbnailImage: '',
  logo: '',
  contentMode: 'whiteboard',
  coverAspect: DEFAULT_COVER_ASPECT,
  layout: createEmptyLayout(),
  blocks: [],
});

const draftFromJournal = (journal: JournalRecord): DraftEntry => ({
  id: journal.id,
  category: 'project',
  date: journal.date || '',
  title: journal.title || '',
  titleEn: '',
  desc: journal.note || '',
  descEn: '',
  videoUrl: '',
  videoSources: [],
  image: journal.coverImage || '',
  thumbnailImage: '',
  logo: '',
  contentMode: 'whiteboard',
  coverAspect: DEFAULT_COVER_ASPECT,
  layout: normalizeLayout(journal.layout, []),
  blocks: [],
});

const buildJournalPayloadFromDraft = (draft: DraftEntry) => ({
  id: draft.id,
  title: draft.title.trim() || 'Untitled Journal',
  date: draft.date.trim(),
  note: draft.desc.trim(),
  coverImage: draft.image.trim(),
  layout: draft.layout,
});

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const toSizeText = (size: number | null | undefined) => {
  if (!Number.isFinite(size) || Number(size) <= 0) return '--';
  const mb = Number(size) / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${(Number(size) / 1024).toFixed(1)} KB`;
};

const describeUploadFiles = (files: File[]) => {
  if (files.length === 0) return 'upload';
  if (files.length === 1) return files[0].name;
  return `${files[0].name} +${files.length - 1}`;
};

const readFileAsDataUrlWithProgress = (
  file: File,
  onProgress?: (loaded: number) => void,
) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    reader.onload = () => {
      onProgress?.(file.size);
      resolve(String(reader.result || ''));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const encodeFilesForUpload = async (
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
) => {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let completed = 0;
  const payload = [] as Array<{ name: string; type: string; data: string }>;
  for (const file of files) {
    const data = await readFileAsDataUrlWithProgress(file, (loaded) => {
      const nextLoaded = completed + loaded;
      onProgress?.({
        loaded: nextLoaded,
        total,
        percent: total > 0 ? Math.min(100, (nextLoaded / total) * 100) : null,
      });
    });
    completed += file.size;
    payload.push({
      name: file.name,
      type: file.type,
      data,
    });
  }
  return payload;
};

const createAwardThumbnailDataUrl = async (
  sourceDataUrl: string,
  maxEdge = 720,
  quality = 0.74,
) => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = sourceDataUrl;
  });
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  if (!width || !height) return '';
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/jpeg', quality);
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const fetchImageAsDataUrl = async (url: string) => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`image_fetch_failed:${res.status}`);
  const blob = await res.blob();
  return blobToDataUrl(blob);
};

export default function AdminStudio({
  lang,
  onBack,
}: {
  lang: 'zh' | 'en';
  onBack: () => void;
}) {
  const [secretInput, setSecretInput] = useState('');
  const [adminSecret, setAdminSecret] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assetUploadProgress, setAssetUploadProgress] = useState<UploadCardState | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginCooldownUntil, setLoginCooldownUntil] = useState<number>(0);
  const [flowUploadingIndex, setFlowUploadingIndex] = useState<number | null>(null);
  const [flowUploadProgress, setFlowUploadProgress] = useState<UploadCardState | null>(null);
  const [flowDropIndex, setFlowDropIndex] = useState<number | null>(null);
  const [storageCleaning, setStorageCleaning] = useState(false);
  const [storageAudit, setStorageAudit] = useState<StorageAudit | null>(null);
  const [visitorStats, setVisitorStats] = useState<{
    today: string;
    todayUnique: number;
    yesterday: string;
    yesterdayUnique: number;
    topRegionsToday: VisitorRegionStat[];
    topRegionsYesterday: VisitorRegionStat[];
  } | null>(null);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [cows, setCows] = useState<Cow[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [pdfs, setPdfs] = useState<PdfPortfolio[]>([]);
  const [journals, setJournals] = useState<JournalRecord[]>([]);
  const [vibecodingProjects, setVibecodingProjects] = useState<VibecodingProject[]>([]);

  const [draft, setDraft] = useState<DraftEntry>(createEmptyDraft());
  const [editorScope, setEditorScope] = useState<'entry' | 'journal'>('entry');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [entryThumbRebuilding, setEntryThumbRebuilding] = useState(false);
  const [entryThumbRebuildProgress, setEntryThumbRebuildProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [awardDraft, setAwardDraft] = useState<AwardDraft>(createEmptyAwardDraft());
  const [selectedAwardId, setSelectedAwardId] = useState<string | null>(null);
  const [awardUploading, setAwardUploading] = useState(false);
  const [awardUploadProgress, setAwardUploadProgress] = useState<UploadCardState | null>(null);
  const [awardThumbRebuilding, setAwardThumbRebuilding] = useState(false);
  const [awardThumbRebuildProgress, setAwardThumbRebuildProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [pdfDraft, setPdfDraft] = useState<PdfDraft>(createEmptyPdfDraft());
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>(null);
  const [vibecodingDraft, setVibecodingDraft] = useState<VibecodingDraft>(createEmptyVibecodingDraft());
  const [selectedVibecodingId, setSelectedVibecodingId] = useState<string | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfUploadProgress, setPdfUploadProgress] = useState<UploadCardState | null>(null);
  const [pdfCoverUploading, setPdfCoverUploading] = useState(false);
  const [pdfCoverUploadProgress, setPdfCoverUploadProgress] = useState<UploadCardState | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<UploadCardState | null>(null);
  const [serverVideoFiles, setServerVideoFiles] = useState<LocalImportFile[]>([]);
  const [serverPdfFiles, setServerPdfFiles] = useState<LocalImportFile[]>([]);
  const [vibecodingImportProjects, setVibecodingImportProjects] = useState<VibecodingImportProject[]>([]);
  const [serverVideoFolder, setServerVideoFolder] = useState('uploads/local-import/videos');
  const [serverPdfFolder, setServerPdfFolder] = useState('uploads/local-import/pdfs');
  const [serverVibecodingFolder, setServerVibecodingFolder] = useState('public/vibecoding-projects');
  const [serverVideoLoading, setServerVideoLoading] = useState(false);
  const [serverPdfLoading, setServerPdfLoading] = useState(false);
  const [serverVibecodingLoading, setServerVibecodingLoading] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const [journalUploading, setJournalUploading] = useState(false);
  const [journalUploadProgress, setJournalUploadProgress] = useState<UploadCardState | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorSaveProgress, setEditorSaveProgress] = useState(0);
  const [editorSavePhase, setEditorSavePhase] = useState<'idle' | 'packing' | 'uploading' | 'syncing' | 'done'>('idle');

  const [entryKeyword, setEntryKeyword] = useState('');
  const [entryFilter, setEntryFilter] = useState<'all' | Category>('all');
  const [assetKeyword, setAssetKeyword] = useState('');
  const [showOrphansOnly, setShowOrphansOnly] = useState(false);

  const [canvasScale, setCanvasScale] = useState(1);
  const [coverDragOver, setCoverDragOver] = useState(false);
  const [canvasDragOver, setCanvasDragOver] = useState(false);

  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragActionRef = useRef<DragAction | null>(null);
  const draftRef = useRef<DraftEntry>(draft);
  const editorSaveTickerRef = useRef<number | null>(null);
  const editorSaveDoneRef = useRef<number | null>(null);

  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);
  const isJournalEditor = editorScope === 'journal';
  const clearEditorSaveTimers = () => {
    if (editorSaveTickerRef.current !== null) {
      window.clearInterval(editorSaveTickerRef.current);
      editorSaveTickerRef.current = null;
    }
    if (editorSaveDoneRef.current !== null) {
      window.clearTimeout(editorSaveDoneRef.current);
      editorSaveDoneRef.current = null;
    }
  };
  const beginEditorSaveProgress = () => {
    clearEditorSaveTimers();
    setEditorSaving(true);
    setEditorSaveProgress(7);
    setEditorSavePhase('packing');
    editorSaveTickerRef.current = window.setInterval(() => {
      setEditorSaveProgress((prev) => {
        if (prev >= 94) return prev;
        const step = Math.max(1, Math.round((100 - prev) * (0.05 + Math.random() * 0.09)));
        const next = Math.min(94, prev + step);
        if (next < 30) setEditorSavePhase('packing');
        else if (next < 75) setEditorSavePhase('uploading');
        else setEditorSavePhase('syncing');
        return next;
      });
    }, 230);
  };
  const finishEditorSaveProgress = () => {
    clearEditorSaveTimers();
    setEditorSavePhase('done');
    setEditorSaveProgress(100);
    editorSaveDoneRef.current = window.setTimeout(() => {
      setEditorSaving(false);
      setEditorSaveProgress(0);
      setEditorSavePhase('idle');
      editorSaveDoneRef.current = null;
    }, 650);
  };
  const failEditorSaveProgress = () => {
    clearEditorSaveTimers();
    setEditorSaving(false);
    setEditorSaveProgress(0);
    setEditorSavePhase('idle');
  };
  const editorSaveCaption =
    editorSavePhase === 'packing'
      ? t('正在整理图层和文本...', 'Packing layers and text...')
      : editorSavePhase === 'uploading'
        ? t('正在写入服务器...', 'Writing to server...')
        : editorSavePhase === 'syncing'
          ? t('正在同步最新列表...', 'Syncing latest records...')
          : editorSavePhase === 'done'
            ? t('保存完成，画布已更新', 'Saved. Canvas is up to date.')
            : '';

  useEffect(() => {
    return () => clearEditorSaveTimers();
  }, []);
  const formatRegionSummary = (items: VisitorRegionStat[]) => {
    if (!Array.isArray(items) || items.length === 0) {
      return t('暂无地区数据', 'No region data');
    }
    return items
      .slice(0, 3)
      .map((item) => `${item.label} ${item.count}`)
      .join(' · ');
  };
  const renderRegionBars = (items: VisitorRegionStat[], emptyTextZh: string, emptyTextEn: string) => {
    if (!Array.isArray(items) || items.length === 0) {
      return <div className="admin-visitor-chart-empty">{t(emptyTextZh, emptyTextEn)}</div>;
    }
    const maxCount = Math.max(...items.map((item) => item.count), 1);
    return (
      <div className="admin-visitor-chart-list">
        {items.map((item) => {
          const width = Math.max(8, Math.round((item.count / maxCount) * 100));
          return (
            <div key={item.key} className="admin-visitor-chart-item" title={`${item.label}: ${item.count} (${item.ratio}%)`}>
              <div className="admin-visitor-chart-label">{item.label}</div>
              <div className="admin-visitor-chart-track">
                <div className="admin-visitor-chart-bar" style={{ width: `${width}%` }} />
              </div>
              <div className="admin-visitor-chart-value">{item.count}</div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderUploadProgressCard = (
    progress: UploadCardState | null,
    label: { zh: string; en: string },
  ) => {
    if (!progress) return null;
    const title =
      progress.phase === 'preparing' ? t('准备上传', 'Preparing Upload') : t(label.zh, label.en);
    const phaseLabel =
      progress.percent !== null
        ? `${Math.round(progress.percent)}%`
        : progress.phase === 'preparing'
          ? t('处理中', 'Processing')
          : t('传输中', 'Transferring');
    return (
      <div className="pdf-upload-progress" role="status" aria-live="polite">
        <div className="pdf-upload-progress-head">
          <strong>{title}</strong>
          <span>{phaseLabel}</span>
        </div>
        <div className="pdf-upload-progress-file">{progress.fileName}</div>
        <div className="pdf-upload-progress-track" aria-hidden="true">
          <div
            className="pdf-upload-progress-bar"
            style={{ width: `${Math.max(4, Math.min(100, progress.percent ?? 12))}%` }}
          />
        </div>
        <div className="pdf-upload-progress-meta">
          {progress.total
            ? `${toSizeText(progress.loaded)} / ${toSizeText(progress.total)}`
            : `${toSizeText(progress.loaded)} ${t('已处理', 'processed')}`}
        </div>
      </div>
    );
  };

  const verifyAdminSecret = async (candidate: string) => {
    const secret = candidate.trim();
    if (!secret) return { ok: false as const, error: 'empty' };
    try {
      await adminApi.verifySecret(secret);
      return { ok: true as const };
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.status === 429) {
        const retryMs = Number(apiErr.payload?.retryAfterMs || 0);
        if (retryMs > 0) setLoginCooldownUntil(Date.now() + retryMs);
      }
      return { ok: false as const, error: apiErr?.message || 'Unauthorized' };
    }
  };

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<AdminAuthState>;
        const restoredSecret = String(parsed?.adminSecret || '').trim();
        if (!parsed?.authorized || !restoredSecret) return;
        const check = await verifyAdminSecret(restoredSecret);
        if (cancelled) return;
        if (!check.ok) {
          sessionStorage.removeItem(ADMIN_SESSION_KEY);
          return;
        }
        setAdminSecret(restoredSecret);
        setSecretInput(restoredSecret);
        setAuthorized(true);
      } catch {
        // ignore malformed session
      }
    };
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      if (authorized && adminSecret) {
        sessionStorage.setItem(
          ADMIN_SESSION_KEY,
          JSON.stringify({ authorized: true, adminSecret }),
        );
      } else {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [authorized, adminSecret]);

  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => {
      document.body.classList.remove('admin-mode');
    };
  }, []);

  useEffect(() => {
    const preventBrowserFileDropNavigation = (e: DragEvent) => {
      const hasFiles = !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      if (!hasFiles) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const opts: AddEventListenerOptions = { capture: true };
    const targets: EventTarget[] = [window, document, document.body];
    const events: Array<'dragenter' | 'dragover' | 'drop'> = ['dragenter', 'dragover', 'drop'];

    targets.forEach((target) => {
      events.forEach((eventName) => {
        target.addEventListener(eventName, preventBrowserFileDropNavigation as EventListener, opts);
      });
    });

    return () => {
      targets.forEach((target) => {
        events.forEach((eventName) => {
          target.removeEventListener(eventName, preventBrowserFileDropNavigation as EventListener, opts);
        });
      });
    };
  }, []);

  const logout = () => {
    setAuthorized(false);
    setAdminSecret('');
    setSecretInput('');
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const authedFetch = async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers || {});
    if (init.body) headers.set('Content-Type', 'application/json');
    headers.set('x-admin-secret', adminSecret);
    headers.set('Authorization', `Bearer ${adminSecret}`);
    try {
      const res = await fetch(url, { ...init, headers });
      if (res.status === 401) {
        alert(t('登录凭证失效，请重新输入管理员密钥', 'Auth invalid. Please login again.'));
      }
      return res;
    } catch (err) {
      alert(t('网络错误，请检查后端服务是否运行', 'Network error. Please check backend service.'));
      throw err;
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [data, assetData, auditData, visitorRaw] = await Promise.all([
        adminApi.getData(),
        adminApi.getAssets(showOrphansOnly),
        adminApi.getStorageAudit(adminSecret),
        adminApi.getVisitorStats(adminSecret).catch(() => null),
      ]);
      setEntries(
        Array.isArray(data.timeline) ? data.timeline.filter((item) => item?.category !== 'award') : [],
      );
      setCows(Array.isArray(data.cows) ? data.cows : []);
      setAssets(Array.isArray(assetData.assets) ? assetData.assets : []);
      setAwards(Array.isArray(data.awards) ? data.awards : []);
      setPdfs(Array.isArray(data.pdfs) ? data.pdfs : []);
      setJournals(Array.isArray(data.journals) ? data.journals : []);
      setVibecodingProjects(Array.isArray(data.vibecodingProjects) ? data.vibecodingProjects : []);
      setStorageAudit(auditData?.audit || null);
      if (visitorRaw && typeof visitorRaw === 'object' && visitorRaw.success) {
        setVisitorStats({
          today: visitorRaw.today,
          todayUnique: visitorRaw.todayUnique,
          yesterday: visitorRaw.yesterday,
          yesterdayUnique: visitorRaw.yesterdayUnique,
          topRegionsToday: Array.isArray(visitorRaw.topRegionsToday)
            ? visitorRaw.topRegionsToday
            : Array.isArray(visitorRaw.topSourcesToday)
              ? visitorRaw.topSourcesToday
              : [],
          topRegionsYesterday: Array.isArray(visitorRaw.topRegionsYesterday)
            ? visitorRaw.topRegionsYesterday
            : Array.isArray(visitorRaw.topSourcesYesterday)
              ? visitorRaw.topSourcesYesterday
              : [],
        });
      } else {
        setVisitorStats(null);
      }
    } catch (err) {
      console.error(err);
      alert(t('加载数据失败，请稍后重试', 'Failed to load data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authorized) return;
    loadAllData();
  }, [authorized, showOrphansOnly]);

  useEffect(() => {
    if (!authorized || !adminSecret) return;
    void loadServerLocalImportFiles('video');
    void loadServerLocalImportFiles('pdf');
    void loadVibecodingImports();
  }, [authorized, adminSecret]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const updateScale = () => {
      const next = clamp((host.clientWidth - 16) / draft.layout.canvas.width, 0.15, 1);
      setCanvasScale(next);
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(host);
    return () => ro.disconnect();
  }, [draft.layout.canvas.width, authorized]);

  useEffect(() => {
    if (isJournalEditor && draft.contentMode !== 'whiteboard') {
      setDraft((prev) => ({...prev, contentMode: 'whiteboard'}));
      return;
    }
    if (draft.contentMode !== 'whiteboard') {
      setSelectedElementId(null);
    }
  }, [draft.contentMode, isJournalEditor]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const action = dragActionRef.current;
      if (!action || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const px = (e.clientX - rect.left) / canvasScale;
      const py = (e.clientY - rect.top) / canvasScale;
      const dx = px - action.startX;
      const dy = py - action.startY;

      setDraft((prev) => {
        const nextElements = prev.layout.elements.map((el) => {
          if (el.id !== action.id) return el;

          if (action.mode === 'move') {
            const nx = snap(clamp(action.originX + dx, 0, prev.layout.canvas.width - el.w));
            const ny = snap(clamp(action.originY + dy, 0, prev.layout.canvas.height - el.h));
            return { ...el, x: nx, y: ny };
          }

          const nw = snap(Math.max(64, action.originW + dx));
          const nh = snap(Math.max(64, action.originH + dy));
          return {
            ...el,
            x: snap(clamp(action.originX, 0, prev.layout.canvas.width - nw)),
            y: snap(clamp(action.originY, 0, prev.layout.canvas.height - nh)),
            w: nw,
            h: nh,
          };
        });
        return { ...prev, layout: { ...prev.layout, elements: nextElements } };
      });
    };

    const onUp = () => {
      dragActionRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [canvasScale]);

  const visibleEntries = useMemo(
    () =>
      entries.filter((item) => {
        if (entryFilter !== 'all' && item.category !== entryFilter) return false;
        if (!entryKeyword.trim()) return true;
        const needle = entryKeyword.trim().toLowerCase();
        return [item.title, item.titleEn, item.desc, item.descEn, item.date]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      }),
    [entries, entryKeyword, entryFilter],
  );

  const visibleAssets = useMemo(
    () =>
      assets.filter((asset) => {
        if (!assetKeyword.trim()) return true;
        const needle = assetKeyword.trim().toLowerCase();
        return [asset.originalName, asset.url].join(' ').toLowerCase().includes(needle);
      }),
    [assets, assetKeyword],
  );

  const sortedPdfs = useMemo(
    () =>
      [...pdfs].sort((a, b) => {
        const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 999999;
        const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 999999;
        if (orderA !== orderB) return orderA - orderB;
        return String(b.date || '').localeCompare(String(a.date || ''));
      }),
    [pdfs],
  );

  const sortedVibecodingProjects = useMemo(
    () =>
      [...vibecodingProjects].sort((a, b) => {
        const byUpdated = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        if (byUpdated !== 0) return byUpdated;
        return String(a.title || '').localeCompare(String(b.title || ''));
      }),
    [vibecodingProjects],
  );

  const sortedJournals = useMemo(
    () =>
      [...journals].sort((a, b) => {
        const byDate = String(b.date || '').localeCompare(String(a.date || ''));
        if (byDate !== 0) return byDate;
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      }),
    [journals],
  );

  const selectedElement = useMemo(
    () => draft.layout.elements.find((el) => el.id === selectedElementId) || null,
    [draft.layout.elements, selectedElementId],
  );

  const startNewDraft = () => {
    setEditorScope('entry');
    setSelectedJournalId(null);
    setSelectedEntryId(null);
    setSelectedElementId(null);
    setDraft(createEmptyDraft());
  };

  const selectEntry = (entry: Entry) => {
    setEditorScope('entry');
    setSelectedJournalId(null);
    setSelectedEntryId(entry.id);
    setSelectedElementId(null);
    setDraft(draftFromEntry(entry));
  };

  const upsertEntry = async () => {
    try {
      const payload = buildPayloadFromDraft(draft);
      const exists = entries.some((entry) => entry.id === draft.id);
      const existingEntry = exists ? entries.find((entry) => entry.id === draft.id) || null : null;
      const endpoint = exists ? `/api/timeline/${draft.id}` : '/api/timeline';
      const method = exists ? 'PUT' : 'POST';

      const res = await authedFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || t('保存失败，请检查管理员密钥', 'Save failed, check admin secret.'));
        return;
      }
      const data = await res.json().catch(() => ({}));
      const savedId = String(data?.item?.id || draft.id || '').trim();
      const previousImage = String(existingEntry?.image || '').trim();
      const nextImage = String(payload.image || '').trim();
      const coverChanged = !!nextImage && nextImage !== previousImage;
      if (savedId && nextImage && (!payload.thumbnailImage || coverChanged)) {
        try {
          const sourceDataUrl = await fetchImageAsDataUrl(nextImage);
          const thumbData = await createAwardThumbnailDataUrl(sourceDataUrl);
          if (thumbData) {
            const thumbResult = await adminApi.uploadTimelineThumbnail(adminSecret, savedId, thumbData);
            const nextThumb = thumbResult?.item?.thumbnailImage || thumbResult?.thumbnailImage || '';
            if (nextThumb) {
              setDraft((prev) => ({
                ...prev,
                thumbnailImage: nextThumb,
              }));
            }
          }
        } catch (err) {
          console.warn('[ENTRY_THUMBNAIL_AUTO_GENERATE]', savedId, err);
        }
      }
      await loadAllData();
      setSelectedEntryId(savedId || draft.id);
      alert(t('保存成功', 'Saved'));
    } catch (err) {
      console.error('[ENTRY_SAVE_FAILED]', err);
      alert(t('保存失败，请稍后重试', 'Save failed. Please try again.'));
    }
  };

  const deleteEntry = async (entryId: string) => {
    const deleteAssets = window.confirm(
      t(
        '是否同时删除关联素材？点击“确定”会删除条目与素材；点击“取消”仅删除条目。',
        'Delete related assets too? OK deletes entry + assets, Cancel keeps assets.',
      ),
    );

    const res = await authedFetch(`/api/timeline/${entryId}`, {
      method: 'DELETE',
      body: JSON.stringify({
        assetStrategy: deleteAssets ? 'deleteAssets' : 'keepAssets',
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || t('删除失败', 'Delete failed'));
      return;
    }
    if (selectedEntryId === entryId) startNewDraft();
    await loadAllData();
  };

  const rebuildEntryThumbnails = async () => {
    const checkThumbUrlExists = async (url: string) => {
      try {
        const res = await fetch(url, {method: 'HEAD', cache: 'no-store'});
        return res.ok;
      } catch {
        return false;
      }
    };

    const targets: Entry[] = [];
    for (const item of entries) {
      if (!item?.image) continue;
      const thumbUrl = String(item.thumbnailImage || '').trim();
      if (!thumbUrl) {
        targets.push(item);
        continue;
      }
      const exists = await checkThumbUrlExists(thumbUrl);
      if (!exists) targets.push(item);
    }
    if (targets.length === 0) {
      alert(t('当前没有需要补全封面缩略图的条目', 'No entries need cover thumbnail backfill.'));
      return;
    }
    const confirmed = window.confirm(
      t(
        `将为 ${targets.length} 个条目补全首页封面缩略图，继续？`,
        `Generate home cover thumbnails for ${targets.length} entries now?`,
      ),
    );
    if (!confirmed) return;

    setEntryThumbRebuilding(true);
    setEntryThumbRebuildProgress({done: 0, total: targets.length});
    let success = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const entry = targets[i];
      try {
        const sourceDataUrl = await fetchImageAsDataUrl(entry.image || '');
        const thumbData = await createAwardThumbnailDataUrl(sourceDataUrl);
        if (!thumbData) throw new Error('thumbnail_generate_failed');
        const result = await adminApi.uploadTimelineThumbnail(adminSecret, entry.id, thumbData);
        const nextThumb = result?.item?.thumbnailImage || result?.thumbnailImage || '';
        if (!nextThumb) throw new Error('thumbnail_upload_failed');
        success += 1;
        setEntries((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  thumbnailImage: nextThumb,
                }
              : item,
          ),
        );
        setDraft((prev) =>
          prev.id === entry.id
            ? {
                ...prev,
                thumbnailImage: nextThumb,
              }
            : prev,
        );
      } catch (err) {
        failed += 1;
        console.warn('[ENTRY_THUMBNAIL_REBUILD]', entry.id, err);
      } finally {
        setEntryThumbRebuildProgress({done: i + 1, total: targets.length});
      }
    }

    setEntryThumbRebuilding(false);
    setEntryThumbRebuildProgress(null);
    alert(
      [
        t('条目封面缩略图补全完成', 'Entry cover thumbnail backfill finished'),
        `${t('成功', 'Success')}: ${success}`,
        `${t('失败', 'Failed')}: ${failed}`,
      ].join('\n'),
    );
  };

  const deleteCow = async (cowId: string) => {
    const res = await fetch(`/api/cows/${cowId}`, { method: 'DELETE' });
    if (!res.ok) return;
    setCows((prev) => prev.filter((cow) => cow.id !== cowId));
  };

  const startNewAward = () => {
    setSelectedAwardId(null);
    setAwardDraft(createEmptyAwardDraft());
  };

  const selectAward = (award: Award) => {
    setSelectedAwardId(award.id);
    setAwardDraft(draftFromAward(award));
  };

  const upsertAward = async () => {
    const payload = {
      ...awardDraft,
      date: awardDraft.date.trim(),
      title: awardDraft.title.trim() || 'Untitled Award',
      workTitle: awardDraft.workTitle.trim(),
      certificateNo: awardDraft.certificateNo.trim(),
      projectName: awardDraft.projectName.trim(),
      authorName: awardDraft.authorName.trim(),
      instructorName: awardDraft.instructorName.trim(),
      organizationName: awardDraft.organizationName.trim(),
      awardLevel: awardDraft.awardLevel.trim(),
      organizer: awardDraft.organizer.trim(),
      image: awardDraft.image.trim(),
      thumbnailImage: awardDraft.thumbnailImage.trim(),
      workEntryIds: awardDraft.workEntryIds,
    };
    const exists = awards.some((item) => item.id === awardDraft.id);
    const endpoint = exists ? `/api/awards/${awardDraft.id}` : '/api/awards';
    const method = exists ? 'PUT' : 'POST';

    const res = await authedFetch(endpoint, {
      method,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || t('奖状保存失败', 'Award save failed'));
      return;
    }
    const data = await res.json().catch(() => ({}));
    const saved = data.award || payload;
    if (exists) {
      setAwards((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
    } else {
      setAwards((prev) => [saved, ...prev]);
    }
    setSelectedAwardId(saved.id);
    setAwardDraft(draftFromAward(saved));
    alert(t('奖状已保存', 'Award saved'));
  };

  const deleteAward = async (awardId: string) => {
    const confirmed = window.confirm(t('确认删除该奖状？', 'Delete this award?'));
    if (!confirmed) return;
    const res = await authedFetch(`/api/awards/${awardId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || t('奖状删除失败', 'Award delete failed'));
      return;
    }
    setAwards((prev) => prev.filter((item) => item.id !== awardId));
    if (selectedAwardId === awardId) startNewAward();
  };

  const uploadAwardImage = async (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList as File[] | FileList) : [];
    const imageFiles = files.filter((file) => file.type === 'image/png' || file.type === 'image/jpeg');
    if (imageFiles.length === 0) return;
    const fileName = describeUploadFiles(imageFiles);
    const total = imageFiles.reduce((sum, file) => sum + file.size, 0);
    setAwardUploading(true);
    setAwardUploadProgress({ fileName, loaded: 0, total, percent: 0, phase: 'preparing' });
    try {
      const payloadFiles = await encodeFilesForUpload(imageFiles, (progress) => {
        setAwardUploadProgress({ fileName, ...progress, phase: 'preparing' });
      });
      const payloadFilesWithThumb = await Promise.all(
        payloadFiles.map(async (item) => {
          try {
            const thumbData = await createAwardThumbnailDataUrl(item.data);
            return {
              ...item,
              thumbData,
            };
          } catch {
            return item;
          }
        }),
      );
      const data = await adminApi.uploadAwardImage(adminSecret, awardDraft.id, payloadFilesWithThumb, {
        onProgress: (progress) => {
          setAwardUploadProgress({ fileName, ...progress, phase: 'uploading' });
        },
      });
      const uploaded = Array.isArray(data.files) ? data.files : [];
      if (uploaded[0]) {
        setAwardDraft((prev) => ({
          ...prev,
          image: uploaded[0].url || prev.image,
          thumbnailImage: uploaded[0].thumbnailImage || prev.thumbnailImage,
          imageNaturalWidth: uploaded[0].imageNaturalWidth,
          imageNaturalHeight: uploaded[0].imageNaturalHeight,
        }));
      }
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('奖状图片上传失败', 'Award image upload failed'));
    } finally {
      setAwardUploading(false);
      setAwardUploadProgress(null);
    }
  };

  const rebuildAwardThumbnails = async () => {
    const checkThumbUrlExists = async (url: string) => {
      try {
        const res = await fetch(url, {method: 'HEAD', cache: 'no-store'});
        return res.ok;
      } catch {
        return false;
      }
    };

    const targets: Award[] = [];
    for (const item of awards) {
      if (!item?.image) continue;
      const thumbUrl = String(item.thumbnailImage || '').trim();
      if (!thumbUrl) {
        targets.push(item);
        continue;
      }
      const exists = await checkThumbUrlExists(thumbUrl);
      if (!exists) targets.push(item);
    }
    if (targets.length === 0) {
      alert(t('当前没有需要补全缩略图的奖状', 'No awards need thumbnail backfill.'));
      return;
    }
    const confirmed = window.confirm(
      t(
        `将为 ${targets.length} 个奖状补全卡牌缩略图，继续？`,
        `Generate card thumbnails for ${targets.length} awards now?`,
      ),
    );
    if (!confirmed) return;

    setAwardThumbRebuilding(true);
    setAwardThumbRebuildProgress({ done: 0, total: targets.length });

    let success = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const award = targets[i];
      try {
        const sourceDataUrl = await fetchImageAsDataUrl(award.image);
        const thumbData = await createAwardThumbnailDataUrl(sourceDataUrl);
        if (!thumbData) throw new Error('thumbnail_generate_failed');
        const result = await adminApi.uploadAwardThumbnail(adminSecret, award.id, thumbData);
        const nextThumb = result?.award?.thumbnailImage || result?.thumbnailImage || '';
        if (!nextThumb) throw new Error('thumbnail_upload_failed');
        success += 1;
        setAwards((prev) =>
          prev.map((item) =>
            item.id === award.id
              ? {
                ...item,
                thumbnailImage: nextThumb,
                updatedAt: result?.award?.updatedAt || item.updatedAt,
              }
              : item,
          ),
        );
        setAwardDraft((prev) =>
          prev.id === award.id
            ? {
              ...prev,
              thumbnailImage: nextThumb,
            }
            : prev,
        );
      } catch (err) {
        failed += 1;
        console.warn('[AWARD_THUMBNAIL_REBUILD]', award.id, err);
      } finally {
        setAwardThumbRebuildProgress({ done: i + 1, total: targets.length });
      }
    }

    setAwardThumbRebuilding(false);
    setAwardThumbRebuildProgress(null);
    alert(
      [
        t('奖状缩略图补全完成', 'Award thumbnail backfill finished'),
        `${t('成功', 'Success')}: ${success}`,
        `${t('失败', 'Failed')}: ${failed}`,
      ].join('\n'),
    );
  };

  const startNewPdf = () => {
    setSelectedPdfId(null);
    setPdfDraft(createEmptyPdfDraft());
  };

  const selectPdf = (pdf: PdfPortfolio) => {
    setSelectedPdfId(pdf.id);
    setPdfDraft(draftFromPdf(pdf));
  };

  const upsertPdf = async () => {
    const payload = {
      ...pdfDraft,
      title: pdfDraft.title.trim() || 'Untitled PDF',
      date: pdfDraft.date.trim(),
      description: pdfDraft.description.trim(),
      fileUrl: pdfDraft.fileUrl.trim(),
      relativePath: pdfDraft.relativePath.trim(),
      coverImage: pdfDraft.coverImage.trim(),
      size: Number(pdfDraft.size) || 0,
      coverImageNaturalWidth: pdfDraft.coverImageNaturalWidth,
      coverImageNaturalHeight: pdfDraft.coverImageNaturalHeight,
      order: Number.isFinite(Number(pdfDraft.order)) ? Number(pdfDraft.order) : 0,
      workEntryIds: pdfDraft.workEntryIds,
    };
    const exists = pdfs.some((item) => item.id === pdfDraft.id);
    const method = exists ? 'PUT' : 'POST';
    const endpoint = exists ? `/api/pdfs/${pdfDraft.id}` : '/api/pdfs';
    const res = await authedFetch(endpoint, {
      method,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || t('PDF 保存失败', 'PDF save failed'));
      return;
    }
    const data = await res.json().catch(() => ({}));
    const saved = data.pdf || payload;
    if (exists) {
      setPdfs((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
    } else {
      setPdfs((prev) => [saved, ...prev]);
    }
    setSelectedPdfId(saved.id);
    setPdfDraft(draftFromPdf(saved));
    alert(t('PDF 已保存', 'PDF saved'));
  };

  const deletePdf = async (pdfId: string) => {
    const confirmed = window.confirm(t('确认删除该 PDF？', 'Delete this PDF?'));
    if (!confirmed) return;
    const res = await authedFetch(`/api/pdfs/${pdfId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || t('PDF 删除失败', 'PDF delete failed'));
      return;
    }
    setPdfs((prev) => prev.filter((item) => item.id !== pdfId));
    if (selectedPdfId === pdfId) startNewPdf();
  };

  const uploadPdfFile = async (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList as File[] | FileList) : [];
    const pdfFiles = files.filter((file) => file.type === 'application/pdf');
    if (pdfFiles.length === 0) return;
    const selectedFile = pdfFiles[0];
    setPdfUploading(true);
    setPdfUploadProgress({
      fileName: selectedFile.name,
      loaded: 0,
      total: selectedFile.size || null,
      percent: 0,
      phase: 'uploading',
    });
    try {
      const data = await adminApi.uploadPdf(adminSecret, pdfDraft.id, selectedFile, {
        onProgress: (progress) => {
          setPdfUploadProgress({
            fileName: selectedFile.name,
            loaded: progress.loaded,
            total: progress.total ?? (selectedFile.size || null),
            percent: progress.percent,
            phase: 'uploading',
          });
        },
      });
      if (data?.file) {
        setPdfDraft((prev) => ({
          ...prev,
          fileUrl: data.file.url || prev.fileUrl,
          relativePath: data.file.relativePath || prev.relativePath,
          size: Number(data.file.size) || prev.size,
        }));
      }
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('PDF 上传失败', 'PDF upload failed'));
    } finally {
      setPdfUploading(false);
      setPdfUploadProgress(null);
    }
  };

  const uploadPdfCoverImage = async (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList as File[] | FileList) : [];
    const imageFiles = files.filter((file) => file.type === 'image/png' || file.type === 'image/jpeg');
    if (imageFiles.length === 0) return;
    const fileName = describeUploadFiles(imageFiles);
    const total = imageFiles.reduce((sum, file) => sum + file.size, 0);
    setPdfCoverUploading(true);
    setPdfCoverUploadProgress({ fileName, loaded: 0, total, percent: 0, phase: 'preparing' });
    try {
      const payloadFiles = await encodeFilesForUpload(imageFiles, (progress) => {
        setPdfCoverUploadProgress({ fileName, ...progress, phase: 'preparing' });
      });
      const data = await adminApi.uploadPdfCover(adminSecret, pdfDraft.id, payloadFiles, {
        onProgress: (progress) => {
          setPdfCoverUploadProgress({ fileName, ...progress, phase: 'uploading' });
        },
      });
      const uploaded = Array.isArray(data.files) ? data.files : [];
      if (uploaded[0]) {
        setPdfDraft((prev) => ({
          ...prev,
          coverImage: uploaded[0].url || prev.coverImage,
          coverImageNaturalWidth: uploaded[0].imageNaturalWidth,
          coverImageNaturalHeight: uploaded[0].imageNaturalHeight,
        }));
      }
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('PDF 封面上传失败', 'PDF cover upload failed'));
    } finally {
      setPdfCoverUploading(false);
      setPdfCoverUploadProgress(null);
    }
  };

  const movePdfOrder = async (pdfId: string, direction: -1 | 1) => {
    const list = [...sortedPdfs];
    const idx = list.findIndex((item) => item.id === pdfId);
    if (idx < 0) return;
    const swapIndex = idx + direction;
    if (swapIndex < 0 || swapIndex >= list.length) return;
    const current = list[idx];
    const target = list[swapIndex];
    const currentOrder = Number.isFinite(Number(current.order)) ? Number(current.order) : idx;
    const targetOrder = Number.isFinite(Number(target.order)) ? Number(target.order) : swapIndex;
    try {
      await Promise.all([
        adminApi.updatePdf(adminSecret, current.id, { order: targetOrder }),
        adminApi.updatePdf(adminSecret, target.id, { order: currentOrder }),
      ]);
      await loadAllData();
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('排序更新失败', 'Order update failed'));
    }
  };

  const startNewVibecoding = () => {
    setSelectedVibecodingId(null);
    setVibecodingDraft(createEmptyVibecodingDraft());
  };

  const selectVibecodingProject = (project: VibecodingProject) => {
    setSelectedVibecodingId(project.id);
    setVibecodingDraft(draftFromVibecodingProject(project));
  };

  const loadVibecodingImports = async () => {
    setServerVibecodingLoading(true);
    try {
      const data = await adminApi.getVibecodingImports(adminSecret);
      setVibecodingImportProjects(Array.isArray(data?.projects) ? data.projects : []);
      setServerVibecodingFolder(String(data?.folder?.absolutePath || data?.folder?.relativePath || ''));
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('读取 VibeCoding 导入目录失败', 'Failed to load the VibeCoding import folder'));
    } finally {
      setServerVibecodingLoading(false);
    }
  };

  const pickVibecodingEntry = (
    importProject: VibecodingImportProject,
    entry: VibecodingImportProject['entries'][number],
  ) => {
    const fallbackTitle =
      importProject.projectFolderName ||
      entry.fileName.replace(/\.(html?|HTML?)$/, '') ||
      'VibeCoding Project';
    setVibecodingDraft((prev) => ({
      ...prev,
      title: prev.title.trim() || fallbackTitle,
      entryUrl: entry.url,
      entryRelativePath: entry.relativePath,
      projectRootRelativePath: importProject.projectRootRelativePath,
    }));
  };

  const upsertVibecoding = async () => {
    const payload = {
      ...vibecodingDraft,
      title: vibecodingDraft.title.trim() || 'Untitled Project',
      description: vibecodingDraft.description.trim(),
      coverImage: vibecodingDraft.coverImage.trim(),
      entryUrl: vibecodingDraft.entryUrl.trim(),
      entryRelativePath: vibecodingDraft.entryRelativePath.trim(),
      projectRootRelativePath: vibecodingDraft.projectRootRelativePath.trim(),
    };
    if (!payload.entryRelativePath) {
      alert(t('请先从服务器目录选择一个 HTML 入口文件', 'Pick an HTML entry file from the server folder first.'));
      return;
    }
    try {
      const exists = vibecodingProjects.some((item) => item.id === vibecodingDraft.id);
      const data = exists
        ? await adminApi.updateVibecodingProject(adminSecret, vibecodingDraft.id, payload)
        : await adminApi.createVibecodingProject(adminSecret, payload);
      const saved = data.project;
      if (exists) {
        setVibecodingProjects((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      } else {
        setVibecodingProjects((prev) => [saved, ...prev]);
      }
      setSelectedVibecodingId(saved.id);
      setVibecodingDraft(draftFromVibecodingProject(saved));
      alert(t('VibeCoding 项目已保存', 'VibeCoding project saved'));
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('VibeCoding 项目保存失败', 'VibeCoding project save failed'));
    }
  };

  const deleteVibecoding = async (projectId: string) => {
    const confirmed = window.confirm(
      t(
        '确认删除这个 VibeCoding 项目记录？原始项目文件夹不会被删除。',
        'Delete this VibeCoding record? The original project folder will stay on disk.',
      ),
    );
    if (!confirmed) return;
    try {
      await adminApi.deleteVibecodingProject(adminSecret, projectId);
      setVibecodingProjects((prev) => prev.filter((item) => item.id !== projectId));
      if (selectedVibecodingId === projectId) {
        startNewVibecoding();
      }
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('VibeCoding 项目删除失败', 'VibeCoding project delete failed'));
    }
  };

  const startNewJournal = () => {
    setEditorScope('journal');
    setSelectedEntryId(null);
    setSelectedElementId(null);
    setSelectedJournalId(null);
    setDraft(createEmptyJournalEditorDraft());
  };

  const selectJournal = (journal: JournalRecord) => {
    setEditorScope('journal');
    setSelectedEntryId(null);
    setSelectedElementId(null);
    setSelectedJournalId(journal.id);
    setDraft(draftFromJournal(journal));
  };

  const upsertJournal = async () => {
    const payload = buildJournalPayloadFromDraft(draft);
    const exists = journals.some((item) => item.id === draft.id);
    const endpoint = exists ? `/api/admin/journals/${draft.id}` : '/api/admin/journals';
    const method = exists ? 'PUT' : 'POST';
    const res = await authedFetch(endpoint, {
      method,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || t('手账保存失败', 'Journal save failed'));
      return;
    }
    const data = await res.json().catch(() => ({}));
    const saved = (data?.journal || payload) as JournalRecord;
    if (exists) {
      setJournals((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
    } else {
      setJournals((prev) => [saved, ...prev]);
    }
    setSelectedJournalId(saved.id);
    setEditorScope('journal');
    setDraft(draftFromJournal(saved));
    alert(t('手账已保存', 'Journal saved'));
  };

  const deleteJournal = async (journalId: string) => {
    const confirmed = window.confirm(t('确认删除该手账？', 'Delete this journal?'));
    if (!confirmed) return;
    const res = await authedFetch(`/api/admin/journals/${journalId}`, {method: 'DELETE'});
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || t('手账删除失败', 'Journal delete failed'));
      return;
    }
    setJournals((prev) => prev.filter((item) => item.id !== journalId));
    if (selectedJournalId === journalId) {
      startNewJournal();
    }
  };

  const uploadJournalImage = async (fileList: FileList | File[] | null) => {
    if (editorScope !== 'journal') {
      alert(t('请先在手账列表中选择或新建记录', 'Select or create a journal record first.'));
      return;
    }
    const files = fileList ? Array.from(fileList as File[] | FileList) : [];
    const imageFiles = files.filter((file) => file.type === 'image/png' || file.type === 'image/jpeg');
    if (imageFiles.length === 0) return;
    const fileName = describeUploadFiles(imageFiles);
    const total = imageFiles.reduce((sum, file) => sum + file.size, 0);
    setJournalUploading(true);
    setJournalUploadProgress({fileName, loaded: 0, total, percent: 0, phase: 'preparing'});
    try {
      const payloadFiles = await encodeFilesForUpload(imageFiles, (progress) => {
        setJournalUploadProgress({fileName, ...progress, phase: 'preparing'});
      });
      const data = await adminApi.uploadJournalImage(adminSecret, draft.id, payloadFiles, {
        onProgress: (progress) => {
          setJournalUploadProgress({fileName, ...progress, phase: 'uploading'});
        },
      });
      const uploaded = Array.isArray(data.files) ? data.files : [];
      if (uploaded.length === 0) return;
      const created = uploaded.map((item: any) => ({
        id: String(item.id || createId('asset_')),
        entryId: null,
        url: String(item.url || ''),
        relativePath: String(item.relativePath || ''),
        originalName: String(item.originalName || item.name || 'journal-image'),
        mime: String(item.mime || 'image/jpeg'),
        size: Number(item.size) || 0,
        createdAt: new Date().toISOString(),
        deleted: false,
      })) as Asset[];
      await insertImagesAtCanvasPoint(created, imageFiles, 120, 120);
      setDraft((prev) => ({...prev, image: prev.image || created[0]?.url || ''}));
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('手账图片上传失败', 'Journal image upload failed'));
    } finally {
      setJournalUploading(false);
      setJournalUploadProgress(null);
    }
  };

  const addTextElement = () => {
    if (draft.contentMode === 'flow') {
      setDraft((prev) => ({
        ...prev,
        blocks: [...prev.blocks, { type: 'text', content: '', contentEn: '' }],
      }));
      return;
    }
    const maxZ = draft.layout.elements.reduce((max, el) => Math.max(max, el.z), 0);
    const element: LayoutTextElement = {
      id: createId('el_'),
      type: 'text',
      x: 80,
      y: 80,
      w: 560,
      h: 180,
      z: maxZ + 1,
      rotation: 0,
      content: t('双击右侧属性可编辑文字', 'Edit text from right panel'),
      style: { color: '#111111', fontSize: 36, fontWeight: 600 },
    };
    setDraft((prev) => ({
      ...prev,
      layout: { ...prev.layout, elements: [...prev.layout.elements, element] },
    }));
    setSelectedElementId(element.id);
  };

  const addImageElementFromAsset = (asset: Asset) => {
    if (draft.contentMode === 'flow') {
      setDraft((prev) => ({
        ...prev,
        blocks: [
          ...prev.blocks,
          { type: 'image', url: asset.url, assetId: asset.id, caption: '', captionEn: '' },
        ],
        image: prev.image || asset.url,
      }));
      return;
    }
    const maxZ = draft.layout.elements.reduce((max, el) => Math.max(max, el.z), 0);
    const element: LayoutImageElement = {
      id: createId('el_'),
      type: 'image',
      x: 120,
      y: 120,
      w: 640,
      h: 360,
      z: maxZ + 1,
      rotation: 0,
      assetId: asset.id,
      url: asset.url,
      style: { fit: 'cover', radius: 12 },
    };
    setDraft((prev) => ({
      ...prev,
      layout: { ...prev.layout, elements: [...prev.layout.elements, element] },
      image: prev.image || asset.url,
    }));
    setSelectedElementId(element.id);
  };

  const updateElement = (id: string, patch: Partial<LayoutElement>) => {
    setDraft((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        elements: prev.layout.elements.map((el) =>
          el.id === id ? ({ ...el, ...patch } as LayoutElement) : el,
        ),
      },
    }));
  };

  const updateTextStyle = (id: string, patch: Partial<LayoutTextStyle>) => {
    setDraft((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        elements: prev.layout.elements.map((el) =>
          el.id === id && el.type === 'text'
            ? ({ ...el, style: { ...el.style, ...patch } } as LayoutTextElement)
            : el,
        ),
      },
    }));
  };

  const updateImageStyle = (id: string, patch: Partial<LayoutImageStyle>) => {
    setDraft((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        elements: prev.layout.elements.map((el) =>
          el.id === id && el.type === 'image'
            ? ({ ...el, style: { ...el.style, ...patch } } as LayoutImageElement)
            : el,
        ),
      },
    }));
  };

  const removeElement = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      layout: { ...prev.layout, elements: prev.layout.elements.filter((el) => el.id !== id) },
    }));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  const updateFlowBlock = (index: number, patch: Partial<FlowBlock>) => {
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block, i) => (i === index ? ({ ...block, ...patch } as FlowBlock) : block)),
    }));
  };

  const removeFlowBlock = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((_, i) => i !== index),
    }));
  };

  const bringToFront = (id: string) => {
    const maxZ = draft.layout.elements.reduce((max, el) => Math.max(max, el.z), 0);
    updateElement(id, { z: maxZ + 1 });
  };

  const sendToBack = (id: string) => {
    const minZ = draft.layout.elements.reduce((min, el) => Math.min(min, el.z), 0);
    updateElement(id, { z: minZ - 1 });
  };

  const sortedElements = useMemo(
    () => [...draft.layout.elements].sort((a, b) => a.z - b.z),
    [draft.layout.elements],
  );

  const handleElementPointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    el: LayoutElement,
  ) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedElementId(el.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / canvasScale;
    const py = (e.clientY - rect.top) / canvasScale;
    dragActionRef.current = {
      mode: 'move',
      id: el.id,
      startX: px,
      startY: py,
      originX: el.x,
      originY: el.y,
    };
  };

  const handleResizePointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    el: LayoutElement,
  ) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedElementId(el.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / canvasScale;
    const py = (e.clientY - rect.top) / canvasScale;
    dragActionRef.current = {
      mode: 'resize',
      id: el.id,
      startX: px,
      startY: py,
      originW: el.w,
      originH: el.h,
      originX: el.x,
      originY: el.y,
    };
  };

  const uploadFilesSafe = async (
    filesInput: File[],
    setProgress?: (progress: UploadCardState | null) => void,
  ) => {
    const files = filesInput.filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return [] as Asset[];
    const fileName = describeUploadFiles(files);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    setUploading(true);
    setProgress?.({ fileName, loaded: 0, total, percent: 0, phase: 'preparing' });
    try {
      const payloadFiles = await encodeFilesForUpload(files, (progress) => {
        setProgress?.({ fileName, ...progress, phase: 'preparing' });
      });
      if (editorScope === 'journal') {
        const data = await adminApi.uploadJournalImage(adminSecret, draft.id, payloadFiles, {
          onProgress: (progress) => {
            setProgress?.({ fileName, ...progress, phase: 'uploading' });
          },
        });
        const uploaded = Array.isArray(data.files) ? data.files : [];
        const created = uploaded.map((item: any) => ({
          id: String(item.id || createId('asset_')),
          entryId: null,
          url: String(item.url || ''),
          relativePath: String(item.relativePath || ''),
          originalName: String(item.originalName || item.name || 'journal-image'),
          mime: String(item.mime || 'image/jpeg'),
          size: Number(item.size) || 0,
          createdAt: new Date().toISOString(),
          deleted: false,
        })) as Asset[];
        return created;
      }
      const data = await adminApi.uploadAssets(adminSecret, draft.id, payloadFiles, {
        onProgress: (progress) => {
          setProgress?.({ fileName, ...progress, phase: 'uploading' });
        },
      });
      const created = Array.isArray(data.assets) ? data.assets : [];
      setAssets((prev) => [...created, ...prev]);
      return created;
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('上传失败', 'Upload failed'));
      return [] as Asset[];
    } finally {
      setUploading(false);
      setProgress?.(null);
    }
  };

  const readImageSize = (file: File) =>
    new Promise<{ width: number; height: number }>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({
          width: Math.max(1, img.naturalWidth || 1),
          height: Math.max(1, img.naturalHeight || 1),
        });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve({ width: 1, height: 1 });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });

  const onUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const created = await uploadFilesSafe(Array.from(fileList), setAssetUploadProgress);
    if (!draft.image && created[0]?.url) {
      setDraft((prev) => ({ ...prev, image: created[0].url }));
    }
  };

  const uploadFlowBlockImage = async (index: number, fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList as File[] | FileList) : [];
    if (files.length === 0) return;
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    setFlowUploadingIndex(index);
    try {
      const created = await uploadFilesSafe(imageFiles, setFlowUploadProgress);
      const first = created[0];
      if (!first?.url) return;
      updateFlowBlock(index, { url: first.url, assetId: first.id } as Partial<FlowBlock>);
      if (!draftRef.current.image) {
        setDraft((prev) => ({ ...prev, image: first.url }));
      }
    } finally {
      setFlowUploadingIndex((current) => (current === index ? null : current));
      setFlowUploadProgress(null);
      setFlowDropIndex((current) => (current === index ? null : current));
    }
  };

  const uploadTimelineVideoFile = async (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList as File[] | FileList) : [];
    if (files.length === 0) return;
    const videoFiles = files.filter((file) => {
      const type = String(file.type || '').toLowerCase();
      if (type === 'video/mp4' || type === 'video/webm' || type === 'video/ogg') return true;
      const name = String(file.name || '').toLowerCase();
      return name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.ogg');
    });
    if (videoFiles.length === 0) return;
    const file = videoFiles[0];
    const fileName = file.name || 'video';
    const total = file.size > 0 ? file.size : null;
    setVideoUploading(true);
    setVideoUploadProgress({ fileName, loaded: 0, total, percent: 0, phase: 'uploading' });
    try {
      const data = await adminApi.uploadTimelineVideo(adminSecret, draft.id, file, {
        onProgress: (progress) => {
          setVideoUploadProgress({ fileName, ...progress, phase: 'uploading' });
        },
      });
      const nextVideoUrl = String(data?.file?.url || '').trim();
      const nextVideoSources = Array.isArray(data?.sources) ? data.sources : [];
      if (!nextVideoUrl) throw new Error('video_upload_failed');
      setDraft((prev) => ({ ...prev, videoUrl: nextVideoUrl, videoSources: nextVideoSources }));
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('视频上传失败', 'Video upload failed'));
    } finally {
      setVideoUploading(false);
      setVideoUploadProgress(null);
    }
  };

  const loadServerLocalImportFiles = async (kind: 'video' | 'pdf') => {
    if (kind === 'video') setServerVideoLoading(true);
    else setServerPdfLoading(true);
    try {
      const data = await adminApi.getLocalImportFiles(adminSecret, kind);
      const files = Array.isArray(data?.files) ? data.files : [];
      if (kind === 'video') {
        setServerVideoFiles(files);
        setServerVideoFolder(String(data?.folder?.absolutePath || data?.folder?.relativePath || ''));
      } else {
        setServerPdfFiles(files);
        setServerPdfFolder(String(data?.folder?.absolutePath || data?.folder?.relativePath || ''));
      }
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('读取服务器导入目录失败', 'Failed to load server import folder'));
    } finally {
      if (kind === 'video') setServerVideoLoading(false);
      else setServerPdfLoading(false);
    }
  };

  const insertImagesAtCanvasPoint = async (
    created: Asset[],
    files: File[],
    cx: number,
    cy: number,
  ) => {
    if (created.length === 0) return;
    const sizeList = await Promise.all(files.slice(0, created.length).map((file) => readImageSize(file)));
    const maxZ = draftRef.current.layout.elements.reduce((max, el) => Math.max(max, el.z), 0);
    const nextElements = created.map((asset, i) => {
      const size = sizeList[i] || { width: 1, height: 1 };
      const width = 520;
      const rawHeight = width * (size.height / size.width);
      const height = Math.max(64, snap(rawHeight));
      return {
        id: createId('el_'),
        type: 'image' as const,
        x: snap(cx + i * 20),
        y: snap(cy + i * 20),
        w: width,
        h: height,
        z: maxZ + i + 1,
        rotation: 0,
        assetId: asset.id,
        url: asset.url,
        style: { fit: 'cover' as const, radius: 12 },
      };
    });
    setDraft((prev) => ({
      ...prev,
      layout: { ...prev.layout, elements: [...prev.layout.elements, ...nextElements] },
      image: prev.image || created[0].url,
    }));
    setSelectedElementId(nextElements[0]?.id || null);
  };

  const deleteAsset = async (asset: Asset) => {
    const force = window.confirm(
      t(
        '若素材仍被引用，是否强制删除？点击“确定”=强制删除；“取消”=仅在未引用时删除。',
        'Force delete if referenced? OK=force, Cancel=only when unreferenced.',
      ),
    );
    const res = await authedFetch(`/api/assets/${asset.id}?force=${force ? 'true' : 'false'}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || t('素材删除失败', 'Asset delete failed'));
      return;
    }

    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    setDraft((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        elements: prev.layout.elements.filter(
          (el) => !(el.type === 'image' && el.assetId === asset.id),
        ),
      },
      image: prev.image === asset.url ? '' : prev.image,
    }));
  };

  const runStorageCleanup = async (
    mode: 'full' | 'emptyDirsOnly' = 'full',
  ) => {
    const confirmed = window.confirm(
      mode === 'emptyDirsOnly'
        ? t('确认只清理空文件夹？', 'Clean empty folders only?')
        : t('确认清理未引用素材、孤立文件和空文件夹？', 'Clean unreferenced assets, orphan files and empty folders?'),
    );
    if (!confirmed) return;
    setStorageCleaning(true);
    try {
      const body =
        mode === 'emptyDirsOnly'
          ? {
            removeOrphanAssetRecords: false,
            removeDeletedAssetFiles: false,
            removeOrphanDiskFiles: false,
            removeEmptyDirs: true,
          }
          : {};
      const res = await authedFetch('/api/admin/storage/cleanup', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const fail = await res.json().catch(() => ({}));
        alert(fail.error || t('清理失败', 'Cleanup failed'));
        return;
      }
      const data = await res.json();
      const summary = data?.summary || {};
      setStorageAudit(data?.audit || null);
      alert(
        [
          t('清理完成', 'Cleanup finished'),
          `${t('未引用素材', 'Orphan assets')}: ${summary.removedOrphanAssetRecords || 0}`,
          `${t('已删记录残留文件', 'Deleted-record files')}: ${summary.removedDeletedAssetFiles || 0}`,
          `${t('孤立磁盘文件', 'Orphan disk files')}: ${summary.removedOrphanDiskFiles || 0}`,
          `${t('空目录', 'Empty directories')}: ${summary.removedEmptyDirs || 0}`,
        ].join('\n'),
      );
      await loadAllData();
    } finally {
      setStorageCleaning(false);
    }
  };

  const runStorageCleanupV2 = async (
    mode: 'full' | 'emptyDirsOnly' | 'dryRun' = 'full',
  ) => {
    const confirmed = window.confirm(
      mode === 'dryRun'
        ? t('仅预览清理结果，不会删除文件，继续吗？', 'Preview cleanup only (no deletion). Continue?')
        : mode === 'emptyDirsOnly'
          ? t('确认只清理空文件夹？', 'Clean empty folders only?')
          : t('确认清理未引用素材、孤立文件和空文件夹？', 'Clean unreferenced assets, orphan files and empty folders?'),
    );
    if (!confirmed) return;
    setStorageCleaning(true);
    try {
      const body =
        mode === 'dryRun'
          ? { mode: 'dry-run' }
          : mode === 'emptyDirsOnly'
            ? {
              mode: 'execute',
              removeOrphanAssetRecords: false,
              removeDeletedAssetFiles: false,
              removeOrphanDiskFiles: false,
              removeEmptyDirs: true,
            }
            : { mode: 'execute' };
      const data = await adminApi.cleanupStorage(adminSecret, body);
      const summary = data?.summary || {};
      setStorageAudit(data?.audit || null);
      alert(
        [
          mode === 'dryRun' ? t('清理预览', 'Cleanup Preview') : t('清理完成', 'Cleanup finished'),
          `${t('模式', 'Mode')}: ${summary.mode || (mode === 'dryRun' ? 'dry-run' : 'execute')}`,
          `${t('未引用素材', 'Orphan assets')}: ${summary.removedOrphanAssetRecords || 0}`,
          `${t('已删记录残留文件', 'Deleted-record files')}: ${summary.removedDeletedAssetFiles || 0}`,
          `${t('孤立磁盘文件', 'Orphan disk files')}: ${summary.removedOrphanDiskFiles || 0}`,
          `${t('空目录', 'Empty directories')}: ${summary.removedEmptyDirs || 0}`,
        ].join('\n'),
      );
      if (mode !== 'dryRun') await loadAllData();
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr?.message || t('清理失败', 'Cleanup failed'));
    } finally {
      setStorageCleaning(false);
    }
  };

  const previewScale = clamp(330 / draft.layout.canvas.width, 0.1, 1);

  if (!authorized) {
    return (
      <div className="admin-page-shell no-grass">
        <div className="admin-login-card">
          <h2>{t('后台登录', 'Admin Login')}</h2>
          <div className="muted">
            {t(
              '请输入 ADMIN_SECRET（服务端环境变量）',
              'Enter ADMIN_SECRET (server environment variable)',
            )}
          </div>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="ADMIN_SECRET"
          />
          <button
            type="button"
            onClick={async () => {
              if (Date.now() < loginCooldownUntil) {
                alert(t('尝试过于频繁，请稍后再试', 'Too many attempts. Please try later.'));
                return;
              }
              const secret = secretInput.trim();
              if (!secret) return;
              setLoginSubmitting(true);
              try {
                const check = await verifyAdminSecret(secret);
                if (!check.ok) {
                  alert(t('密码错误或后端不可用', 'Invalid password or backend unavailable.'));
                  return;
                }
                setAdminSecret(secret);
                setAuthorized(true);
              } finally {
                setLoginSubmitting(false);
              }
            }}
            disabled={loginSubmitting}
          >
            {t('进入工作台', 'Enter Studio')}
          </button>
          <button type="button" className="ghost" onClick={onBack}>
            {t('返回主页', 'Back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-shell no-grass">
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <div className="admin-top-title">{t('内容工作台', 'Content Studio')}</div>
          {visitorStats ? (
            <div className="admin-visitor-stats muted" title={`${visitorStats.today} · ${visitorStats.yesterday}`}>
              <div>
                {t('今日独立访客', 'Today UV')}: {visitorStats.todayUnique}
                <span className="admin-visitor-stats-yesterday">
                  {' '}
                  · {t('昨日', 'Yest.')}: {visitorStats.yesterdayUnique}
                </span>
              </div>
              <div className="admin-visitor-sources">
                {t('今日地区', 'Today Region')}: {formatRegionSummary(visitorStats.topRegionsToday)}
                <span className="admin-visitor-stats-yesterday">
                  {' '}
                  · {t('昨日地区', 'Yest. Region')}: {formatRegionSummary(visitorStats.topRegionsYesterday)}
                </span>
              </div>
              <div className="admin-visitor-chart-wrap">
                <div className="admin-visitor-chart-block">
                  <div className="admin-visitor-chart-title">{t('今日地区分布', 'Today Region Distribution')}</div>
                  {renderRegionBars(visitorStats.topRegionsToday, '暂无今日地区数据', 'No region data for today')}
                </div>
                <div className="admin-visitor-chart-block">
                  <div className="admin-visitor-chart-title">{t('昨日地区分布', 'Yest. Region Distribution')}</div>
                  {renderRegionBars(visitorStats.topRegionsYesterday, '暂无昨日地区数据', 'No region data for yesterday')}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="admin-top-actions">
          <button type="button" className="ghost" onClick={loadAllData}>
            {loading ? t('刷新中...', 'Refreshing...') : t('刷新', 'Refresh')}
          </button>
          <button type="button" className="ghost" onClick={logout}>
            {t('退出登录', 'Logout')}
          </button>
          <button type="button" className="ghost" onClick={onBack}>
            {t('返回主页', 'Back')}
          </button>
        </div>
      </header>

      <div className="admin-workspace">
        <aside className="admin-col admin-list-col">
          <div className="admin-card">
            <div className="admin-card-head">
              <div className="admin-card-title">{t('条目列表', 'Entries')}</div>
              <div className="asset-head-actions">
                <button type="button" className="ghost" onClick={startNewDraft}>
                  {t('新建', 'New')}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={rebuildEntryThumbnails}
                  disabled={entryThumbRebuilding}
                  title={t('为缺少缩略图的条目生成首页封面小图', 'Backfill home cover thumbnails for entries')}
                >
                  {entryThumbRebuilding ? t('补全中..', 'Backfilling...') : t('补全封面缩略图', 'Backfill cover thumbs')}
                </button>
              </div>
            </div>
            {entryThumbRebuildProgress ? (
              <div className="admin-inline-note">
                {t('封面缩略图进度', 'Cover thumbnail progress')}: {entryThumbRebuildProgress.done}/
                {entryThumbRebuildProgress.total}
              </div>
            ) : null}
            <input
              value={entryKeyword}
              onChange={(e) => setEntryKeyword(e.target.value)}
              placeholder={t('搜索标题/摘要', 'Search title/desc')}
            />
            <div className="admin-filter-row">
              {(['all', 'project', 'video', 'edu'] as const).map((cat) => (
                <button
                  type="button"
                  key={cat}
                  className={entryFilter === cat ? 'active' : ''}
                  onClick={() => setEntryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="admin-entry-list">
              {visibleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`admin-entry-item ${selectedEntryId === entry.id ? 'selected' : ''}`}
                >
                  <div onClick={() => selectEntry(entry)}>
                    <div className="entry-title">{entry.title || 'Untitled'}</div>
                    <div className="entry-meta">
                      {entry.date || 'Now'} / {entry.category}
                    </div>
                  </div>
                  <button type="button" className="ghost" onClick={() => selectEntry(entry)}>
                    {t('编辑', 'Edit')}
                  </button>
                  <button type="button" className="danger" onClick={() => deleteEntry(entry.id)}>
                    {t('删', 'Del')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-head">
              <div className="admin-card-title">{t('VibeCoding 小项目', 'VibeCoding Projects')}</div>
              <button type="button" className="ghost" onClick={startNewVibecoding}>
                {t('新建', 'New')}
              </button>
            </div>
            <div className="admin-entry-list award-list">
              {sortedVibecodingProjects.map((project) => (
                <div
                  key={project.id}
                  className={`admin-entry-item ${selectedVibecodingId === project.id ? 'selected' : ''}`}
                >
                  <div onClick={() => selectVibecodingProject(project)}>
                    <div className="entry-title">{project.title || 'Untitled Project'}</div>
                    <div className="entry-meta">{project.slug || '--'}</div>
                  </div>
                  <button type="button" className="danger" onClick={() => deleteVibecoding(project.id)}>
                    {t('删', 'Del')}
                  </button>
                </div>
              ))}
              {sortedVibecodingProjects.length === 0 ? (
                <div className="muted">{t('暂无 VibeCoding 项目', 'No VibeCoding projects')}</div>
              ) : null}
            </div>
            <label>{t('标题', 'Title')}</label>
            <input
              value={vibecodingDraft.title}
              onChange={(e) => setVibecodingDraft((prev) => ({...prev, title: e.target.value}))}
            />
            <label>{t('简介', 'Description')}</label>
            <textarea
              value={vibecodingDraft.description}
              onChange={(e) => setVibecodingDraft((prev) => ({...prev, description: e.target.value}))}
            />
            <label>{t('封面 URL', 'Cover URL')}</label>
            <input
              value={vibecodingDraft.coverImage}
              onChange={(e) => setVibecodingDraft((prev) => ({...prev, coverImage: e.target.value}))}
              placeholder="/vibecoding-projects/project/cover.png"
            />
            <div className="vibecoding-admin-cover">
              {vibecodingDraft.coverImage ? (
                <img src={vibecodingDraft.coverImage} alt="vibecoding cover preview" />
              ) : (
                <div className="vibecoding-admin-cover-empty">
                  <strong>{vibecodingDraft.title || 'VibeCoding Project'}</strong>
                  <span>{t('优先使用 public/vibecoding-projects 里的图片，也可以填公网图片链接。', 'Prefer an image inside public/vibecoding-projects, or use any public image URL.')}</span>
                </div>
              )}
            </div>
            <div className="admin-filter-row">
              <button
                type="button"
                className="ghost"
                onClick={() => void loadVibecodingImports()}
                disabled={serverVibecodingLoading}
              >
                {serverVibecodingLoading ? t('刷新中...', 'Refreshing...') : t('扫描仓库里的 HTML 项目', 'Scan tracked HTML projects')}
              </button>
            </div>
            <div className="muted">
              {t('仓库项目目录', 'Tracked project folder')}: <code>{serverVibecodingFolder}</code>
            </div>
            <div className="vibecoding-import-groups">
              {vibecodingImportProjects.map((project) => (
                <div key={project.projectRootRelativePath} className="vibecoding-import-group">
                  <div className="vibecoding-import-group-head">
                    <strong>{project.projectFolderName}</strong>
                    <span>{project.entries.length} HTML</span>
                  </div>
                  <select
                    value={
                      project.entries.some((entry) => entry.relativePath === vibecodingDraft.entryRelativePath)
                        ? vibecodingDraft.entryRelativePath
                        : ''
                    }
                    onChange={(e) => {
                      const picked = project.entries.find((entry) => entry.relativePath === e.target.value);
                      if (picked) pickVibecodingEntry(project, picked);
                    }}
                  >
                    <option value="">{t('选择这个项目的入口 HTML', 'Choose this project entry HTML')}</option>
                    {project.entries.map((entry) => (
                      <option key={entry.relativePath} value={entry.relativePath}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {vibecodingImportProjects.length === 0 ? (
                <div className="muted">
                  {t('还没有可发布的 HTML 子项目。请先把项目文件夹放进 public/vibecoding-projects。', 'No publishable HTML subprojects were found yet. Put project folders into public/vibecoding-projects first.')}
                </div>
              ) : null}
            </div>
            <label>{t('入口文件', 'Entry File')}</label>
            <input value={vibecodingDraft.entryRelativePath} readOnly />
            <label>{t('项目根目录', 'Project Root')}</label>
            <input value={vibecodingDraft.projectRootRelativePath} readOnly />
            <label>{t('分享 slug', 'Share Slug')}</label>
            <input value={vibecodingDraft.slug} readOnly placeholder="save to generate" />
            <div className="admin-filter-row">
              <button type="button" onClick={upsertVibecoding}>
                {t('保存项目', 'Save Project')}
              </button>
              {vibecodingDraft.entryUrl ? (
                <a className="ghost" href={vibecodingDraft.entryUrl} target="_blank" rel="noreferrer">
                  {t('预览 HTML', 'Preview HTML')}
                </a>
              ) : null}
              {vibecodingDraft.slug ? (
                <a className="ghost" href={`/vibecoding/${encodeURIComponent(vibecodingDraft.slug)}`} target="_blank" rel="noreferrer">
                  {t('分享页', 'Share Page')}
                </a>
              ) : null}
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-head">
              <div className="admin-card-title">{t('素材库', 'Assets')}</div>
              <div className="asset-head-actions">
                <button type="button" className="ghost" onClick={addTextElement}>
                  {t('加文本', 'Add Text')}
                </button>
                <label className="file-upload-btn">
                  {uploading ? t('上传中...', 'Uploading...') : t('上传', 'Upload')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    onChange={(e) => onUploadFiles(e.target.files)}
                    disabled={uploading}
                  />
                </label>
                {renderUploadProgressCard(assetUploadProgress, {
                  zh: '素材上传中',
                  en: 'Uploading Assets',
                })}
              </div>
            </div>
            <input
              value={assetKeyword}
              onChange={(e) => setAssetKeyword(e.target.value)}
              placeholder={t('搜索素材', 'Search assets')}
            />
            <div className="admin-filter-row">
              <button
                type="button"
                className={showOrphansOnly ? 'active' : ''}
                onClick={() => setShowOrphansOnly((v) => !v)}
              >
                {t('仅未引用', 'Only orphan')}
              </button>
            </div>
            <div className="admin-filter-row">
              <button type="button" className="ghost" onClick={loadAllData}>
                {t('刷新审计', 'Refresh audit')}
              </button>
              <button type="button" onClick={() => runStorageCleanupV2('full')} disabled={storageCleaning}>
                {storageCleaning ? t('清理中..', 'Cleaning...') : t('清理垃圾', 'Clean garbage')}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => runStorageCleanupV2('emptyDirsOnly')}
                disabled={storageCleaning}
              >
                {t('仅清空目录', 'Only empty dirs')}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => runStorageCleanupV2('dryRun')}
                disabled={storageCleaning}
              >
                {t('预览清理', 'Dry run')}
              </button>
            </div>
            <div className="storage-audit-grid">
              <div className="storage-audit-item">
                <span>{t('上传总文件', 'Upload files')}</span>
                <strong>{storageAudit?.totalUploadFiles ?? '--'}</strong>
              </div>
              <div className="storage-audit-item">
                <span>{t('手账图片', 'Journal files')}</span>
                <strong>{storageAudit?.journalUploadFiles ?? '--'}</strong>
              </div>
              <div className="storage-audit-item">
                <span>{t('未引用素材', 'Orphan assets')}</span>
                <strong>{storageAudit?.orphanAssetRecords ?? '--'}</strong>
              </div>
              <div className="storage-audit-item">
                <span>{t('孤立磁盘文件', 'Orphan files')}</span>
                <strong>{storageAudit?.orphanDiskFiles ?? '--'}</strong>
              </div>
              <div className="storage-audit-item">
                <span>{t('已删记录残留文件', 'Deleted-record files')}</span>
                <strong>{storageAudit?.deletedAssetFiles ?? '--'}</strong>
              </div>
            </div>
            <div className="muted storage-path" title={storageAudit?.uploadRoot || ''}>
              {storageAudit?.uploadRoot || t('尚未加载存储信息', 'Storage audit not loaded')}
            </div>
            <div className="muted storage-last-cleanup">
              {storageAudit?.lastCleanupAt
                ? `${t('最近清理', 'Last cleanup')}: ${storageAudit.lastCleanupAt}`
                : t('暂无清理记录', 'No cleanup history')}
            </div>
            {storageAudit?.lastCleanupSummary ? (
              <div className="muted storage-last-cleanup">
                {`${t('上次结果', 'Last result')}: ${t('模式', 'Mode')} ${storageAudit.lastCleanupSummary.mode || '--'
                  } · ${t('孤立文件', 'Orphan files')} ${storageAudit.lastCleanupSummary.removedOrphanDiskFiles || 0
                  } · ${t('空目录', 'Empty dirs')} ${storageAudit.lastCleanupSummary.removedEmptyDirs || 0
                  }`}
              </div>
            ) : null}
            <div className="asset-grid">
              {visibleAssets.map((asset) => (
                <div key={asset.id} className="asset-card">
                  <img src={asset.url} alt={asset.originalName} />
                  <div className="asset-name" title={asset.originalName}>
                    {asset.originalName}
                  </div>
                  <div className="asset-actions">
                    <button type="button" onClick={() => addImageElementFromAsset(asset)}>
                      {t('放入画布', 'Insert')}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setDraft((prev) => ({ ...prev, image: asset.url }))}
                    >
                      {t('设为封面', 'Set cover')}
                    </button>
                    <button type="button" className="danger" onClick={() => deleteAsset(asset)}>
                      {t('删', 'Del')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-head">
              <div className="admin-card-title">{t('奖状管理', 'Awards')}</div>
              <div className="asset-head-actions">
                <button type="button" className="ghost" onClick={startNewAward}>
                  {t('新建', 'New')}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={rebuildAwardThumbnails}
                  disabled={awardThumbRebuilding}
                  title={t('为缺少缩略图的旧奖状生成卡牌小图', 'Backfill card thumbnails for old awards')}
                >
                  {awardThumbRebuilding ? t('补全中..', 'Backfilling...') : t('补全缩略图', 'Backfill thumbs')}
                </button>
              </div>
            </div>
            {awardThumbRebuildProgress ? (
              <div className="admin-inline-note">
                {t('缩略图进度', 'Thumbnail progress')}: {awardThumbRebuildProgress.done}/
                {awardThumbRebuildProgress.total}
              </div>
            ) : null}
            <div className="admin-entry-list award-list">
              {awards.map((award) => (
                <div
                  key={award.id}
                  className={`admin-entry-item ${selectedAwardId === award.id ? 'selected' : ''}`}
                >
                  <div onClick={() => selectAward(award)}>
                    <div className="entry-title">{award.title || 'Untitled Award'}</div>
                    <div className="entry-meta">{award.date || '--'}</div>
                  </div>
                  <button type="button" className="danger" onClick={() => deleteAward(award.id)}>
                    {t('删', 'Del')}
                  </button>
                </div>
              ))}
              {awards.length === 0 ? <div className="muted">{t('暂无奖状', 'No awards')}</div> : null}
            </div>
            <label>{t('获奖日期', 'Award Date')}</label>
            <input
              value={awardDraft.date}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, date: e.target.value }))}
              placeholder="2026.03.24"
            />
            <label>{t('获奖名称', 'Award Title')}</label>
            <input
              value={awardDraft.title}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, title: e.target.value }))}
            />
            <label>{t('获奖作品文本', 'Work Label')}</label>
            <input
              value={awardDraft.workTitle}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, workTitle: e.target.value }))}
            />
            <label>{t('证书编号', 'Certificate No')}</label>
            <input
              value={awardDraft.certificateNo}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, certificateNo: e.target.value }))}
            />
            <label>{t('作品名称', 'Project Name')}</label>
            <input
              value={awardDraft.projectName}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, projectName: e.target.value }))}
            />
            <label>{t('作者姓名', 'Author Name')}</label>
            <input
              value={awardDraft.authorName}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, authorName: e.target.value }))}
            />
            <label>{t('指导老师', 'Instructor')}</label>
            <input
              value={awardDraft.instructorName}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, instructorName: e.target.value }))}
            />
            <label>{t('参赛单位', 'Organization')}</label>
            <input
              value={awardDraft.organizationName}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, organizationName: e.target.value }))}
            />
            <label>{t('获奖等级', 'Award Level')}</label>
            <input
              value={awardDraft.awardLevel}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, awardLevel: e.target.value }))}
            />
            <label>{t('组委会', 'Organizer')}</label>
            <input
              value={awardDraft.organizer}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, organizer: e.target.value }))}
            />
            <label>{t('关联作品（多选）', 'Linked Works')}</label>
            <div className="award-work-select">
              {entries.map((entry) => {
                const checked = awardDraft.workEntryIds.includes(entry.id);
                return (
                  <label key={entry.id} className="award-work-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...awardDraft.workEntryIds, entry.id]
                          : awardDraft.workEntryIds.filter((id) => id !== entry.id);
                        setAwardDraft((prev) => ({ ...prev, workEntryIds: Array.from(new Set(next)) }));
                      }}
                    />
                    <span>{(entry.title || 'Untitled').slice(0, 28)} · {entry.date || '--'}</span>
                  </label>
                );
              })}
              {entries.length === 0 ? <div className="muted">{t('暂无可关联作品', 'No works')}</div> : null}
            </div>
            <label>{t('奖状图片 URL', 'Award Image URL')}</label>
            <input
              value={awardDraft.image}
              onChange={(e) => setAwardDraft((prev) => ({ ...prev, image: e.target.value }))}
            />
            <label className="file-upload-btn">
              {awardUploading ? t('上传中..', 'Uploading...') : t('上传奖状 PNG/JPG', 'Upload PNG/JPG')}
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => uploadAwardImage(e.target.files)}
                disabled={awardUploading}
              />
            </label>
            {renderUploadProgressCard(awardUploadProgress, {
              zh: '奖状上传中',
              en: 'Uploading Award Image',
            })}
            <div className="admin-filter-row">
              <button type="button" onClick={upsertAward}>
                {t('保存奖状', 'Save Award')}
              </button>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-head">
              <div className="admin-card-title">{t('PDF 作品集', 'PDF Portfolios')}</div>
              <button type="button" className="ghost" onClick={startNewPdf}>
                {t('新建', 'New')}
              </button>
            </div>
            <div className="admin-entry-list award-list">
              {sortedPdfs.map((pdf) => (
                <div
                  key={pdf.id}
                  className={`admin-entry-item ${selectedPdfId === pdf.id ? 'selected' : ''}`}
                >
                  <div onClick={() => selectPdf(pdf)}>
                    <div className="entry-title">{pdf.title || 'Untitled PDF'}</div>
                    <div className="entry-meta">{pdf.date || '--'} · #{Number(pdf.order) || 0}</div>
                  </div>
                  <div className="asset-actions">
                    <button type="button" className="ghost" onClick={() => movePdfOrder(pdf.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="ghost" onClick={() => movePdfOrder(pdf.id, 1)}>
                      ↓
                    </button>
                    <button type="button" className="danger" onClick={() => deletePdf(pdf.id)}>
                      {t('删', 'Del')}
                    </button>
                  </div>
                </div>
              ))}
              {sortedPdfs.length === 0 ? <div className="muted">{t('暂无 PDF', 'No PDFs')}</div> : null}
            </div>
            <label>{t('标题', 'Title')}</label>
            <input
              value={pdfDraft.title}
              onChange={(e) => setPdfDraft((prev) => ({ ...prev, title: e.target.value }))}
            />
            <label>{t('日期', 'Date')}</label>
            <input
              value={pdfDraft.date}
              onChange={(e) => setPdfDraft((prev) => ({ ...prev, date: e.target.value }))}
              placeholder="2026.03"
            />
            <label>{t('简介', 'Description')}</label>
            <textarea
              value={pdfDraft.description}
              onChange={(e) => setPdfDraft((prev) => ({ ...prev, description: e.target.value }))}
            />
            <label>{t('封面图 URL', 'Cover URL')}</label>
            <input
              value={pdfDraft.coverImage}
              onChange={(e) =>
                setPdfDraft((prev) => ({
                  ...prev,
                  coverImage: e.target.value,
                  coverImageNaturalWidth: undefined,
                  coverImageNaturalHeight: undefined,
                }))
              }
            />
            <div className="pdf-cover-admin-preview">
              {pdfDraft.coverImage ? (
                <img src={pdfDraft.coverImage} alt="pdf cover preview" />
              ) : (
                <div className="pdf-cover-admin-empty">
                  <strong>{pdfDraft.title || 'Portfolio Cover'}</strong>
                  <span>{pdfDraft.date || 'Upload a cover image to improve the portfolio cards.'}</span>
                </div>
              )}
            </div>
            <div className="admin-filter-row">
              <label className="file-upload-btn">
                {pdfCoverUploading ? t('上传中...', 'Uploading...') : t('上传封面 JPG/PNG', 'Upload Cover JPG/PNG')}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => uploadPdfCoverImage(e.target.files)}
                  disabled={pdfCoverUploading}
                />
              </label>
              {renderUploadProgressCard(pdfCoverUploadProgress, {
                zh: 'PDF 封面上传中',
                en: 'Uploading PDF Cover',
              })}
              {pdfDraft.coverImage ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    setPdfDraft((prev) => ({
                      ...prev,
                      coverImage: '',
                      coverImageNaturalWidth: undefined,
                      coverImageNaturalHeight: undefined,
                    }))
                  }
                >
                  {t('移除封面', 'Remove Cover')}
                </button>
              ) : null}
            </div>
            <label>{t('显示顺序', 'Display Order')}</label>
            <CommitNumberInput
              value={pdfDraft.order}
              step={1}
              onCommit={(value) => setPdfDraft((prev) => ({ ...prev, order: value }))}
            />
            <label>{t('关联作品（多选）', 'Linked Works')}</label>
            <div className="award-work-select">
              {entries.map((entry) => {
                const checked = pdfDraft.workEntryIds.includes(entry.id);
                return (
                  <label key={entry.id} className="award-work-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...pdfDraft.workEntryIds, entry.id]
                          : pdfDraft.workEntryIds.filter((id) => id !== entry.id);
                        setPdfDraft((prev) => ({ ...prev, workEntryIds: Array.from(new Set(next)) }));
                      }}
                    />
                    <span>{(entry.title || 'Untitled').slice(0, 28)} · {entry.date || '--'}</span>
                  </label>
                );
              })}
              {entries.length === 0 ? <div className="muted">{t('暂无可关联作品', 'No works')}</div> : null}
            </div>
            <label>{t('PDF 文件 URL', 'PDF File URL')}</label>
            <input
              value={pdfDraft.fileUrl}
              onChange={(e) => setPdfDraft((prev) => ({ ...prev, fileUrl: e.target.value }))}
            />
            <div className="admin-filter-row">
              <button
                type="button"
                className="ghost"
                onClick={() => void loadServerLocalImportFiles('pdf')}
                disabled={serverPdfLoading}
              >
                {serverPdfLoading ? t('刷新中...', 'Refreshing...') : t('从服务器目录选择 PDF', 'Pick from server folder')}
              </button>
            </div>
            <div className="muted">
              {t('服务器导入目录', 'Server import folder')}: <code>{serverPdfFolder}</code>
            </div>
            <select
              value={serverPdfFiles.some((file) => file.url === pdfDraft.fileUrl) ? pdfDraft.fileUrl : ''}
              onChange={(e) => {
                const selectedUrl = e.target.value;
                const picked = serverPdfFiles.find((file) => file.url === selectedUrl);
                setPdfDraft((prev) => ({
                  ...prev,
                  fileUrl: selectedUrl,
                  relativePath: picked?.relativePath || prev.relativePath,
                  size: Number.isFinite(Number(picked?.size)) ? Number(picked?.size) : prev.size,
                }));
              }}
            >
              <option value="">
                {serverPdfFiles.length > 0
                  ? t('选择已拷贝 PDF 文件', 'Select a copied PDF file')
                  : t('目录里还没有 PDF 文件', 'No PDF file in folder yet')}
              </option>
              {serverPdfFiles.map((file) => (
                <option key={file.relativePath} value={file.url}>
                  {`${file.name} (${toSizeText(file.size)})`}
                </option>
              ))}
            </select>
            <label className="file-upload-btn">
              {pdfUploading ? t('上传中...', 'Uploading...') : t('上传 PDF', 'Upload PDF')}
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => uploadPdfFile(e.target.files)}
                disabled={pdfUploading}
              />
            </label>
            {renderUploadProgressCard(pdfUploadProgress, {
              zh: 'PDF 上传中',
              en: 'Uploading PDF',
            })}
            <div className="admin-filter-row">
              <button type="button" onClick={upsertPdf}>
                {t('保存 PDF', 'Save PDF')}
              </button>
              {pdfDraft.fileUrl ? (
                <a className="ghost" href={pdfDraft.fileUrl} target="_blank" rel="noreferrer">
                  {t('预览', 'Preview')}
                </a>
              ) : null}
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-head">
              <div className="admin-card-title">{t('手账本管理', 'Journals')}</div>
              <button type="button" className="ghost" onClick={startNewJournal}>
                {t('新建', 'New')}
              </button>
            </div>
            <div className="admin-entry-list award-list">
              {sortedJournals.map((journal) => (
                <div
                  key={journal.id}
                  className={`admin-entry-item ${selectedJournalId === journal.id ? 'selected' : ''}`}
                >
                  <div onClick={() => selectJournal(journal)}>
                    <div className="entry-title">{journal.title || 'Untitled Journal'}</div>
                    <div className="entry-meta">{journal.date || '--'}</div>
                  </div>
                  <button type="button" className="danger" onClick={() => deleteJournal(journal.id)}>
                    {t('删', 'Del')}
                  </button>
                </div>
              ))}
              {sortedJournals.length === 0 ? <div className="muted">{t('暂无手账记录', 'No journals')}</div> : null}
            </div>
            {!isJournalEditor ? (
              <div className="muted">
                {t('从上方列表选择一条手账，右侧白板会切换为手账编辑。', 'Pick a journal above to switch the whiteboard to journal editing.')}
              </div>
            ) : (
              <>
                <label>{t('标题', 'Title')}</label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((prev) => ({...prev, title: e.target.value}))}
                />
                <label>{t('日期', 'Date')}</label>
                <input
                  value={draft.date}
                  onChange={(e) => setDraft((prev) => ({...prev, date: e.target.value}))}
                  placeholder="2026-03-31"
                />
                <label>{t('记录文字', 'Note')}</label>
                <textarea
                  value={draft.desc}
                  onChange={(e) => setDraft((prev) => ({...prev, desc: e.target.value}))}
                />
                <label className="file-upload-btn">
                  {journalUploading ? t('上传中..', 'Uploading...') : t('上传手账 PNG/JPG', 'Upload Journal PNG/JPG')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    onChange={(e) => uploadJournalImage(e.target.files)}
                    disabled={journalUploading}
                  />
                </label>
                {renderUploadProgressCard(journalUploadProgress, {
                  zh: '手账图片上传中',
                  en: 'Uploading Journal Images',
                })}
                <div className="admin-filter-row">
                  <button type="button" onClick={upsertJournal}>
                    {t('保存手账', 'Save Journal')}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="admin-card">
            <div className="admin-card-title">{t('活跃牛牛', 'Active Cows')}</div>
            <div className="admin-cow-list">
              {cows.map((cow) => (
                <div key={cow.id} className="admin-cow-item">
                  <span>{cow.name}</span>
                  <button type="button" className="danger" onClick={() => deleteCow(cow.id)}>
                    {t('放生', 'Release')}
                  </button>
                </div>
              ))}
              {cows.length === 0 ? <div className="muted">{t('暂无', 'Empty')}</div> : null}
            </div>
          </div>
        </aside>

        <section className="admin-col admin-editor-col">
          <div className="admin-card grow">
            <div className="admin-card-head">
              <div className="admin-card-title">{isJournalEditor ? t('手账白板编辑区', 'Journal Whiteboard') : t('白板编辑区', 'Whiteboard')}</div>
              <div className="admin-editor-actions">
                <button type="button" onClick={isJournalEditor ? upsertJournal : upsertEntry}>
                  {isJournalEditor ? t('保存手账', 'Save Journal') : t('保存/更新', 'Save / Update')}
                </button>
              </div>
            </div>

            <div className="admin-grid-two">
              {!isJournalEditor ? (
                <div>
                  <label>{t('分类', 'Category')}</label>
                  <select
                    value={draft.category}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, category: e.target.value as Category }))
                    }
                  >
                    <option value="project">project</option>
                    <option value="video">video</option>
                    <option value="edu">edu</option>
                  </select>
                </div>
              ) : null}
              <div>
                <label>{t('日期', 'Date')}</label>
                <input
                  value={draft.date}
                  onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))}
                  placeholder="2026.03"
                />
              </div>
            </div>

            <label>{t('标题', 'Title')}</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            />
            <label>{t('英文标题', 'Title EN')}</label>
            <input
              value={draft.titleEn}
              onChange={(e) => setDraft((prev) => ({ ...prev, titleEn: e.target.value }))}
            />
            <label>{t('摘要', 'Description')}</label>
            <textarea
              value={draft.desc}
              onChange={(e) => setDraft((prev) => ({ ...prev, desc: e.target.value }))}
            />
            <label>{t('英文摘要', 'Description EN')}</label>
            <textarea
              value={draft.descEn}
              onChange={(e) => setDraft((prev) => ({ ...prev, descEn: e.target.value }))}
            />
            <label>{t('内容模式', 'Content Mode')}</label>
            <select
              value={draft.contentMode}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, contentMode: e.target.value as ContentMode }))
              }
            >
              <option value="whiteboard">{t('白板模式', 'Whiteboard')}</option>
              <option value="flow">{t('竖向图文', 'Vertical Flow')}</option>
            </select>
            <label>{t('视频链接', 'Video URL')}</label>
            <input
              value={draft.videoUrl}
              onChange={(e) => setDraft((prev) => ({ ...prev, videoUrl: e.target.value, videoSources: [] }))}
              placeholder="https://www.bilibili.com/video/BV..."
            />
            {!isJournalEditor ? (
              <>
                <label className="file-upload-btn">
                  {videoUploading ? t('上传中...', 'Uploading...') : t('上传本地视频', 'Upload local video')}
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogg"
                    disabled={videoUploading}
                    onChange={(e) => {
                      void uploadTimelineVideoFile(e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <div className="muted">{t('支持 MP4 / WEBM / OGG', 'Supports MP4 / WEBM / OGG')}</div>
                {videoUploading
                  ? renderUploadProgressCard(videoUploadProgress, {
                    zh: '视频上传中',
                    en: 'Uploading Video',
                  })
                  : null}
                <div className="admin-filter-row">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void loadServerLocalImportFiles('video')}
                    disabled={serverVideoLoading}
                  >
                    {serverVideoLoading ? t('刷新中...', 'Refreshing...') : t('从服务器目录选择视频', 'Pick from server folder')}
                  </button>
                </div>
                <div className="muted">
                  {t('服务器导入目录', 'Server import folder')}: <code>{serverVideoFolder}</code>
                </div>
                <select
                  value={serverVideoFiles.some((file) => file.url === draft.videoUrl) ? draft.videoUrl : ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, videoUrl: e.target.value, videoSources: [] }))}
                >
                  <option value="">
                    {serverVideoFiles.length > 0
                      ? t('选择已拷贝视频文件', 'Select a copied video file')
                      : t('目录里还没有视频文件', 'No video file in folder yet')}
                  </option>
                  {serverVideoFiles.map((file) => (
                    <option key={file.relativePath} value={file.url}>
                      {`${file.name} (${toSizeText(file.size)})`}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label>{t('封面图 URL', 'Cover URL')}</label>
            <input
              value={draft.image}
              onChange={(e) => setDraft((prev) => ({ ...prev, image: e.target.value }))}
            />
            <label>{t('封面比例', 'Cover Aspect')}</label>
            <select
              value={draft.coverAspect}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, coverAspect: normalizeCoverAspect(e.target.value) }))
              }
            >
              {COVER_ASPECT_OPTIONS.map((aspect) => (
                <option key={aspect} value={aspect}>
                  {aspect}
                </option>
              ))}
            </select>
            <div
              className={`cover-drop-zone ${coverDragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setCoverDragOver(true);
              }}
              onDragLeave={() => setCoverDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setCoverDragOver(false);
                const files = Array.from(e.dataTransfer.files || []) as File[];
                const created = await uploadFilesSafe(files);
                if (created[0]?.url) {
                  setDraft((prev) => ({ ...prev, image: created[0].url }));
                }
              }}
            >
              {t('拖拽图片到这里，直接设为封面', 'Drop image here to set cover')}
            </div>

            <label>{t('卡片 Logo URL（悬浮时显示）', 'Card Logo URL (shown on hover)')}</label>
            <input
              value={draft.logo}
              onChange={(e) => setDraft((prev) => ({ ...prev, logo: e.target.value }))}
              placeholder="https://..."
            />
            <div
              className={`cover-drop-zone ${coverDragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setCoverDragOver(true); }}
              onDragLeave={() => setCoverDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setCoverDragOver(false);
                const files = Array.from(e.dataTransfer.files || []) as File[];
                const created = await uploadFilesSafe(files);
                if (created[0]?.url) {
                  setDraft((prev) => ({ ...prev, logo: created[0].url }));
                }
              }}
            >
              {t('拖拽 Logo 图片到这里', 'Drop logo image here')}
            </div>

            <div className="admin-grid-two">
              <div>
                <label>{t('白板宽度', 'Canvas Width')}</label>
                <CommitNumberInput
                  value={draft.layout.canvas.width}
                  min={640}
                  step={1}
                  onCommit={(width) =>
                    setDraft((prev) => ({
                      ...prev,
                      layout: {
                        ...prev.layout,
                        canvas: { ...prev.layout.canvas, width },
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label>{t('白板背景色', 'Canvas BG')}</label>
                <input
                  type="color"
                  value={draft.layout.canvas.bgColor || '#ffffff'}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      layout: {
                        ...prev.layout,
                        canvas: { ...prev.layout.canvas, bgColor: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label>{t('白板高度', 'Canvas Height')}</label>
                <CommitNumberInput
                  value={draft.layout.canvas.height}
                  min={600}
                  step={1}
                  onCommit={(height) =>
                    setDraft((prev) => ({
                      ...prev,
                      layout: {
                        ...prev.layout,
                        canvas: { ...prev.layout.canvas, height },
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div
              className="wb-toolbar-note"
              style={{ display: draft.contentMode === 'whiteboard' ? 'block' : 'none' }}
            >
              {t(
                '提示：拖拽元素移动，右下角拖拽缩放，自动 8px 吸附。',
                'Tip: drag to move, drag corner to resize, snapped to 8px grid.',
              )}
            </div>

            <div
              className={`wb-host ${canvasDragOver ? 'drag-over' : ''}`}
              style={{ display: draft.contentMode === 'whiteboard' ? 'block' : 'none' }}
              ref={canvasHostRef}
              onDragOver={(e) => {
                e.preventDefault();
                setCanvasDragOver(true);
              }}
              onDragLeave={() => setCanvasDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setCanvasDragOver(false);
                const files = Array.from(e.dataTransfer.files || []) as File[];
                if (files.length === 0 || !canvasRef.current) return;
                const imageFiles = files.filter((f) => f.type.startsWith('image/'));
                const created = await uploadFilesSafe(imageFiles);
                if (created.length === 0) return;
                const rect = canvasRef.current.getBoundingClientRect();
                const cx = clamp(snap((e.clientX - rect.left) / canvasScale), 0, draft.layout.canvas.width - 200);
                const cy = clamp(snap((e.clientY - rect.top) / canvasScale), 0, draft.layout.canvas.height - 120);
                await insertImagesAtCanvasPoint(created, imageFiles, cx, cy);
              }}
            >
              <div
                className="wb-canvas-shell"
                style={{
                  width: draft.layout.canvas.width * canvasScale,
                  height: draft.layout.canvas.height * canvasScale,
                }}
              >
                <div
                  ref={canvasRef}
                  className="wb-canvas"
                  onPointerDown={() => setSelectedElementId(null)}
                  style={{
                    width: draft.layout.canvas.width,
                    height: draft.layout.canvas.height,
                    background: draft.layout.canvas.bgColor || '#ffffff',
                    transform: `scale(${canvasScale})`,
                    transformOrigin: 'top left',
                    backgroundImage:
                      'linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)',
                    backgroundSize: `${GRID}px ${GRID}px`,
                  }}
                >
                  {sortedElements.map((el) => (
                    <div
                      key={el.id}
                      className={`wb-element ${selectedElementId === el.id ? 'selected' : ''}`}
                      onPointerDown={(e) => handleElementPointerDown(e, el)}
                      style={{
                        left: el.x,
                        top: el.y,
                        width: el.w,
                        height: el.h,
                        zIndex: el.z,
                        transform: `rotate(${el.rotation}deg)`,
                      }}
                    >
                      {el.type === 'text' ? (
                        <div
                          className="wb-text"
                          style={{
                            color: el.style.color,
                            fontSize: `${el.style.fontSize}px`,
                            fontWeight: el.style.fontWeight,
                          }}
                        >
                          {el.content}
                        </div>
                      ) : (
                        <img
                          src={el.url}
                          alt="layout"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: el.style.fit,
                            borderRadius: `${el.style.radius}px`,
                          }}
                        />
                      )}

                      {selectedElementId === el.id ? (
                        <div className="wb-resize-handle" onPointerDown={(e) => handleResizePointerDown(e, el)} />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {draft.contentMode === 'flow' ? (
              <div className="flow-editor">
                <div className="admin-filter-row">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        blocks: [...prev.blocks, { type: 'text', content: '', contentEn: '' }],
                      }))
                    }
                  >
                    {t('加文本块', 'Add Text Block')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        blocks: [...prev.blocks, { type: 'image', url: '', caption: '', captionEn: '' }],
                      }))
                    }
                  >
                    {t('加图片块', 'Add Image Block')}
                  </button>
                </div>
                <div className="flow-block-list">
                  {draft.blocks.map((block, index) => (
                    <div className="flow-block-item" key={`flow-${index}`}>
                      <div className="admin-card-head">
                        <div className="admin-card-title">{block.type}</div>
                        <button type="button" className="danger" onClick={() => removeFlowBlock(index)}>
                          {t('删除', 'Delete')}
                        </button>
                      </div>
                      {block.type === 'text' ? (
                        <>
                          <textarea
                            value={(block as FlowTextBlock).content || ''}
                            onChange={(e) => updateFlowBlock(index, { content: e.target.value } as Partial<FlowBlock>)}
                            placeholder={t('输入文本内容', 'Text content')}
                          />
                          <textarea
                            value={(block as FlowTextBlock).contentEn || ''}
                            onChange={(e) =>
                              updateFlowBlock(index, { contentEn: e.target.value } as Partial<FlowBlock>)
                            }
                            placeholder={t('输入英文文本（可选）', 'Text EN (optional)')}
                          />
                        </>
                      ) : (
                        <>
                          <input
                            value={(block as FlowImageBlock).url || ''}
                            onChange={(e) => updateFlowBlock(index, { url: e.target.value } as Partial<FlowBlock>)}
                            placeholder="https://..."
                          />
                          <label className="file-upload-btn">
                            {flowUploadingIndex === index ? t('上传中..', 'Uploading...') : t('上传本地图片', 'Upload local image')}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              onChange={(e) => uploadFlowBlockImage(index, e.target.files)}
                              disabled={flowUploadingIndex === index}
                            />
                          </label>
                          {flowUploadingIndex === index
                            ? renderUploadProgressCard(flowUploadProgress, {
                              zh: '图片上传中',
                              en: 'Uploading Image',
                            })
                            : null}
                          <div
                            className={`flow-drop-zone ${flowDropIndex === index ? 'drag-over' : ''}`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFlowDropIndex(index);
                            }}
                            onDragLeave={() => {
                              setFlowDropIndex((current) => (current === index ? null : current));
                            }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFlowDropIndex(null);
                              await uploadFlowBlockImage(index, e.dataTransfer.files);
                            }}
                          >
                            {t('拖拽图片到这里上传', 'Drop image here to upload')}
                          </div>
                          <input
                            value={(block as FlowImageBlock).caption || ''}
                            onChange={(e) => updateFlowBlock(index, { caption: e.target.value } as Partial<FlowBlock>)}
                            placeholder={t('图注（可选）', 'Caption (optional)')}
                          />
                        </>
                      )}
                    </div>
                  ))}
                  {draft.blocks.length === 0 ? <div className="muted">{t('暂无图文块', 'No flow blocks')}</div> : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="admin-col admin-preview-col">
          <div className="admin-card">
            <div className="admin-card-title">{t('元素属性', 'Element Properties')}</div>
            {draft.contentMode !== 'whiteboard' ? (
              <div className="muted">{t('竖向图文模式无需元素属性面板', 'Flow mode does not use element properties')}</div>
            ) : !selectedElement ? (
              <div className="muted">{t('请选择画布元素', 'Select an element on canvas')}</div>
            ) : (
              <>
                <div className="admin-grid-two">
                  <div>
                    <label>X</label>
                    <CommitNumberInput
                      value={selectedElement.x}
                      step={GRID}
                      onCommit={(x) => updateElement(selectedElement.id, { x: snap(x) })}
                    />
                  </div>
                  <div>
                    <label>Y</label>
                    <CommitNumberInput
                      value={selectedElement.y}
                      step={GRID}
                      onCommit={(y) => updateElement(selectedElement.id, { y: snap(y) })}
                    />
                  </div>
                </div>

                <div className="admin-grid-two">
                  <div>
                    <label>W</label>
                    <CommitNumberInput
                      value={selectedElement.w}
                      min={64}
                      step={GRID}
                      onCommit={(w) =>
                        updateElement(selectedElement.id, {
                          w: Math.max(64, snap(w)),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label>H</label>
                    <CommitNumberInput
                      value={selectedElement.h}
                      min={64}
                      step={GRID}
                      onCommit={(h) =>
                        updateElement(selectedElement.id, {
                          h: Math.max(64, snap(h)),
                        })
                      }
                    />
                  </div>
                </div>

                <label>Rotation</label>
                <CommitNumberInput
                  value={selectedElement.rotation}
                  step={1}
                  onCommit={(rotation) => updateElement(selectedElement.id, { rotation })}
                />
                <label>Z</label>
                <CommitNumberInput
                  value={selectedElement.z}
                  step={1}
                  onCommit={(z) => updateElement(selectedElement.id, { z })}
                />

                <div className="admin-filter-row">
                  <button type="button" onClick={() => bringToFront(selectedElement.id)}>
                    {t('前移', 'Bring front')}
                  </button>
                  <button type="button" onClick={() => sendToBack(selectedElement.id)}>
                    {t('后移', 'Send back')}
                  </button>
                  <button type="button" className="danger" onClick={() => removeElement(selectedElement.id)}>
                    {t('删除元素', 'Delete element')}
                  </button>
                </div>

                {selectedElement.type === 'text' ? (
                  <>
                    <label>{t('文本内容', 'Text')}</label>
                    <textarea
                      value={selectedElement.content}
                      onChange={(e) =>
                        updateElement(selectedElement.id, { content: e.target.value } as Partial<LayoutElement>)
                      }
                    />
                    <label>{t('文字颜色', 'Color')}</label>
                    <input
                      type="color"
                      value={selectedElement.style.color}
                      onChange={(e) => updateTextStyle(selectedElement.id, { color: e.target.value })}
                    />
                    <label>{t('字号', 'Font size')}</label>
                    <CommitNumberInput
                      value={selectedElement.style.fontSize}
                      min={12}
                      step={1}
                      onCommit={(fontSize) =>
                        updateTextStyle(selectedElement.id, {
                          fontSize: Math.max(12, fontSize),
                        })
                      }
                    />
                    <label>{t('粗细', 'Weight')}</label>
                    <CommitNumberInput
                      value={selectedElement.style.fontWeight}
                      min={100}
                      step={1}
                      onCommit={(fontWeight) =>
                        updateTextStyle(selectedElement.id, {
                          fontWeight: Math.max(100, fontWeight),
                        })
                      }
                    />
                  </>
                ) : (
                  <>
                    <label>Image URL</label>
                    <input
                      value={selectedElement.url}
                      onChange={(e) =>
                        updateElement(selectedElement.id, { url: e.target.value } as Partial<LayoutElement>)
                      }
                    />
                    <label>{t('填充方式', 'Object fit')}</label>
                    <select
                      value={selectedElement.style.fit}
                      onChange={(e) =>
                        updateImageStyle(selectedElement.id, {
                          fit: e.target.value === 'contain' ? 'contain' : 'cover',
                        })
                      }
                    >
                      <option value="cover">cover</option>
                      <option value="contain">contain</option>
                    </select>
                    <label>{t('圆角', 'Radius')}</label>
                    <CommitNumberInput
                      value={selectedElement.style.radius}
                      min={0}
                      step={1}
                      onCommit={(radius) =>
                        updateImageStyle(selectedElement.id, {
                          radius: Math.max(0, radius),
                        })
                      }
                    />
                  </>
                )}
              </>
            )}
          </div>

          <div className="admin-card grow">
            <div className="admin-card-title">{t('详情页实时预览', 'Detail Preview')}</div>
            <div className="wb-preview-shell">
              <div
                className="wb-preview-canvas"
                style={{
                  width: draft.layout.canvas.width,
                  height: draft.layout.canvas.height,
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  background: draft.layout.canvas.bgColor || '#ffffff',
                  display: draft.contentMode === 'whiteboard' ? 'block' : 'none',
                }}
              >
                {sortedElements.map((el) => (
                  <div
                    key={`preview-${el.id}`}
                    style={{
                      position: 'absolute',
                      left: el.x,
                      top: el.y,
                      width: el.w,
                      height: el.h,
                      zIndex: el.z,
                      transform: `rotate(${el.rotation}deg)`,
                      overflow: 'hidden',
                    }}
                  >
                    {el.type === 'text' ? (
                      <div
                        style={{
                          color: el.style.color,
                          fontSize: `${el.style.fontSize}px`,
                          fontWeight: el.style.fontWeight,
                          lineHeight: 1.35,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {el.content}
                      </div>
                    ) : (
                      <img
                        src={el.url}
                        alt="preview"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: el.style.fit,
                          borderRadius: `${el.style.radius}px`,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              {draft.contentMode === 'flow' ? (
                <div className="flow-preview-wrap">
                  {draft.blocks.map((block, index) =>
                    block.type === 'text' ? (
                      <div key={`flow-preview-${index}`} className="flow-preview-text">
                        {block.content}
                      </div>
                    ) : (
                      <div key={`flow-preview-${index}`} className="flow-preview-image-wrap">
                        <img src={block.url || ''} alt="" className="flow-preview-image" />
                        {(block.caption || '').trim() ? (
                          <div className="flow-preview-caption">{block.caption}</div>
                        ) : null}
                      </div>
                    ),
                  )}
                  {draft.blocks.length === 0 ? <div className="muted">{t('暂无图文块', 'No flow blocks')}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
