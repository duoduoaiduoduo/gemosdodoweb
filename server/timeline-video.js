import fs from 'node:fs';
import path from 'node:path';
import {runMediaProcess, createSerialMediaQueue} from './media-process.js';

const pickVideoLabelFromHeight = (height) => {
  const h = Number(height) || 0;
  if (h >= 1000 && h <= 1180) return '1080p';
  if (h >= 660 && h <= 780) return '720p';
  if (h >= 430 && h <= 540) return '480p';
  return 'Original';
};

const TIMELINE_VIDEO_VARIANTS = [
  {label: '1080p', height: 1080, bitrateKbps: 4500},
  {label: '720p', height: 720, bitrateKbps: 2600},
  {label: '480p', height: 480, bitrateKbps: 1200},
];

const originalResult = ({entryId, absPath, mime, originalName, size}, meta = null) => {
  const relativePath = path.join('uploads', 'timeline', entryId, path.basename(absPath));
  const url = `/${relativePath.replace(/\\/g, '/')}`;
  return {
    defaultUrl: url,
    sources: [{
      label: pickVideoLabelFromHeight(meta?.height), url, relativePath, mime,
      size: Number(size) || 0, height: Number(meta?.height) || 0,
      width: Number(meta?.width) || 0, bitrateKbps: Number(meta?.bitrateKbps) || 0,
      isOriginal: true, originalName,
    }],
  };
};

export const createTimelineVideoProcessor = ({
  runProcess = runMediaProcess,
  maxPending = 2,
  probeTimeoutMs = 30_000,
  transcodeTimeoutMs = 15 * 60_000,
} = {}) => {
  const enqueue = createSerialMediaQueue({maxPending});
  const probeVideoMeta = async (absPath) => {
    try {
      const result = await runProcess('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0', '-show_entries',
        'stream=width,height,bit_rate', '-of', 'json', absPath,
      ], {timeoutMs: probeTimeoutMs});
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

  const generateVariants = async (input) => {
    const {entryId, absPath, fileId, baseName} = input;
    const sourceMeta = await probeVideoMeta(absPath);
    const result = originalResult(input, sourceMeta);
    const {sources} = result;
    if (!sourceMeta?.height || !sourceMeta?.width) return result;

    for (const variant of TIMELINE_VIDEO_VARIANTS) {
      if (sourceMeta.height <= variant.height) continue;
      const variantFileName = `${fileId}-${baseName}-${variant.label}.mp4`;
      const variantAbsPath = path.join(path.dirname(absPath), variantFileName);
      let transcoded;
      try {
        transcoded = await runProcess('ffmpeg', [
          '-y', '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1',
          '-i', absPath, '-vf', `scale=-2:${variant.height}`,
          '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast', '-crf', '23',
          '-maxrate', `${variant.bitrateKbps}k`, '-bufsize', `${variant.bitrateKbps * 2}k`,
          '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', variantAbsPath,
        ], {timeoutMs: transcodeTimeoutMs});
      } catch {
        transcoded = {status: null};
      }
      if (transcoded.status !== 0 || !fs.existsSync(variantAbsPath)) {
        // Only discard this job's incomplete derived file; keep the original upload.
        try { fs.unlinkSync(variantAbsPath); } catch { /* Best-effort cleanup. */ }
        continue;
      }
      const variantMeta = await probeVideoMeta(variantAbsPath);
      let variantSize = 0;
      try { variantSize = Number(fs.statSync(variantAbsPath).size) || 0; } catch { /* Preserve fallback metadata. */ }
      const variantRelativePath = path.join('uploads', 'timeline', entryId, variantFileName);
      sources.push({
        label: variant.label, url: `/${variantRelativePath.replace(/\\/g, '/')}`,
        relativePath: variantRelativePath, mime: 'video/mp4', size: variantSize,
        height: Number(variantMeta?.height) || variant.height,
        width: Number(variantMeta?.width) || 0, bitrateKbps: variant.bitrateKbps,
        isOriginal: false, originalName: variantFileName,
      });
    }

    const defaultSource = sources.find((item) => item.label === '720p') ||
      sources.find((item) => item.label === '480p') ||
      sources.find((item) => item.label === '1080p') || sources[0];
    return {defaultUrl: defaultSource?.url || result.defaultUrl, sources};
  };

  return async (input) => {
    try {
      return await enqueue(() => generateVariants(input));
    } catch (error) {
      if (error.code !== 'MEDIA_QUEUE_FULL') throw error;
      // The original remains usable even when optional transcoding is at capacity.
      return originalResult(input);
    }
  };
};
