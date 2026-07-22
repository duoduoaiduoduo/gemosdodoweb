export type ApiError = {
  status: number;
  message: string;
  payload?: any;
};

export type UploadProgress = {
  loaded: number;
  total: number | null;
  percent: number | null;
};

export type LocalImportKind = 'video' | 'pdf';

export type LocalImportFile = {
  name: string;
  url: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
};

export type LocalImportFilesResponse = {
  success: boolean;
  kind: LocalImportKind;
  folder: {
    absolutePath: string;
    relativePath: string;
    urlPrefix: string;
  };
  files: LocalImportFile[];
};

export type VibecodingProject = {
  id: string;
  slug: string;
  title: string;
  titleZh?: string;
  titleEn?: string;
  description?: string;
  descriptionZh?: string;
  descriptionEn?: string;
  coverImage?: string;
  entryUrl: string;
  entryRelativePath: string;
  projectRootRelativePath: string;
  createdAt: string;
  updatedAt: string;
};

export type VibecodingImportEntry = {
  name: string;
  fileName: string;
  url: string;
  relativePath: string;
  size: number;
  modifiedAt: string | null;
};

export type VibecodingImportProject = {
  projectFolderName: string;
  projectRootRelativePath: string;
  entries: VibecodingImportEntry[];
};

export type VibecodingImportsResponse = {
  success: boolean;
  folder: {
    absolutePath: string;
    relativePath: string;
    urlPrefix: string;
  };
  projects: VibecodingImportProject[];
};

export type VibecodingListResponse = {
  success: boolean;
  projects: VibecodingProject[];
};

export type JournalLayoutTextElement = {
  id: string;
  type: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation: number;
  content: string;
  style?: {
    color?: string;
    fontSize?: number;
    fontWeight?: number;
  };
};

export type JournalLayoutImageElement = {
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
  style?: {
    fit?: 'cover' | 'contain';
    radius?: number;
  };
};

export type JournalLayoutElement = JournalLayoutTextElement | JournalLayoutImageElement;

export type JournalRecord = {
  id: string;
  title: string;
  date?: string;
  note?: string;
  coverImage?: string;
  layout: {
    version: 1;
    canvas: {
      width: number;
      height: number;
      bgColor?: string;
    };
    elements: JournalLayoutElement[];
  };
  createdAt: string;
  updatedAt: string;
};

export type JournalListResponse = {
  success: boolean;
  journals: JournalRecord[];
};

type UploadOptions = {
  onProgress?: (progress: UploadProgress) => void;
};

const networkUnreachableMessage =
  '无法连接 API（开发环境请先启动后端：在项目根目录另开终端执行 npm run server，或直接用 npm start 同时启动前后端；后端默认端口 3001）。' +
  ' Cannot reach API (start the backend: npm run server, or npm start; port 3001).';

const isNetworkFailureMessage = (msg: string) =>
  /Failed to fetch|NetworkError|Load failed|fetch.*aborted/i.test(msg);

const createNetworkUnreachableError = (): ApiError => ({
  status: 0,
  message: networkUnreachableMessage,
  payload: undefined,
});

const toSizeText = (size: number | null | undefined) => {
  if (!Number.isFinite(size) || Number(size) <= 0) return '0 MB';
  const mb = Number(size) / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${(Number(size) / 1024).toFixed(1)} KB`;
};

const createUploadInterruptedError = (progress: UploadProgress): ApiError => ({
  status: 0,
  message:
    `上传在 ${toSizeText(progress.loaded)} 时被服务器或代理中断。` +
    ' 这通常不是后端没启动，而是 CDN、Nginx、PM2 或服务器进程在上传中途断开了连接。',
  payload: {
    code: 'UPLOAD_CONNECTION_DROPPED',
    loaded: progress.loaded,
    total: progress.total,
    percent: progress.percent,
  },
});

const toApiError = async (res: Response): Promise<ApiError> => {
  const payload = await res.json().catch(() => ({}));
  return {
    status: res.status,
    message: payload?.error || `HTTP ${res.status}`,
    payload,
  };
};

const parseXhrPayload = (xhr: XMLHttpRequest) => {
  if (xhr.response && typeof xhr.response === 'object') return xhr.response;
  if (!xhr.responseText) return {};
  try {
    return JSON.parse(xhr.responseText);
  } catch {
    return {};
  }
};

const jsonRequest = async <T>(
  url: string,
  init: RequestInit = {},
  adminSecret?: string,
): Promise<T> => {
  const headers = new Headers(init.headers || {});
  if (init.body) headers.set('Content-Type', 'application/json');
  if (adminSecret) {
    headers.set('x-admin-secret', adminSecret);
    headers.set('Authorization', `Bearer ${adminSecret}`);
  }
  let res: Response;
  try {
    res = await fetch(url, {...init, headers});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isNetworkFailureMessage(msg)) throw createNetworkUnreachableError();
    throw e;
  }
  if (!res.ok) {
    throw await toApiError(res);
  }
  return res.json();
};

const xhrUploadRequest = <T>({
  url,
  method = 'POST',
  body,
  adminSecret,
  contentType,
  onProgress,
}: {
  url: string;
  method?: 'POST' | 'PUT';
  body: string | FormData;
  adminSecret?: string;
  contentType?: string;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastProgress: UploadProgress = {
      loaded: 0,
      total: null,
      percent: 0,
    };
    xhr.open(method, url);
    xhr.responseType = 'json';
    if (adminSecret) {
      xhr.setRequestHeader('x-admin-secret', adminSecret);
      xhr.setRequestHeader('Authorization', `Bearer ${adminSecret}`);
    }
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable && event.total > 0 ? event.total : null;
      const percent = total ? Math.min(100, (event.loaded / total) * 100) : null;
      lastProgress = {
        loaded: event.loaded,
        total,
        percent,
      };
      onProgress?.(lastProgress);
    };
    xhr.onerror = () => {
      if (lastProgress.loaded > 0) {
        reject(createUploadInterruptedError(lastProgress));
        return;
      }
      reject(createNetworkUnreachableError());
    };
    xhr.onabort = () =>
      reject({status: 0, message: 'Upload canceled', payload: undefined} satisfies ApiError);
    xhr.onload = () => {
      const payload = parseXhrPayload(xhr);
      if (xhr.status >= 200 && xhr.status < 300) {
        const finalTotal = lastProgress.total;
        onProgress?.({
          loaded: finalTotal ?? lastProgress.loaded,
          total: finalTotal,
          percent: 100,
        });
        resolve(payload as T);
        return;
      }
      reject({
        status: xhr.status,
        message: payload?.error || `HTTP ${xhr.status}`,
        payload,
      } satisfies ApiError);
    };
    try {
      xhr.send(body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isNetworkFailureMessage(msg)) {
        reject(createNetworkUnreachableError());
        return;
      }
      reject(e);
    }
  });

const jsonUploadRequest = <T>(
  url: string,
  payload: unknown,
  adminSecret?: string,
  options: UploadOptions = {},
) =>
  xhrUploadRequest<T>({
    url,
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
    adminSecret,
    contentType: 'application/json',
    onProgress: options.onProgress,
  });

export const adminApi = {
  verifySecret(secret: string) {
    return jsonRequest<{success: boolean}>('/api/admin/auth/verify', {
      method: 'POST',
      body: JSON.stringify({secret}),
    });
  },
  getData() {
    return jsonRequest<any>('/api/data');
  },
  getAssets(orphanOnly: boolean) {
    return jsonRequest<any>(`/api/assets${orphanOnly ? '?orphan=true' : ''}`);
  },
  getStorageAudit(secret: string) {
    return jsonRequest<any>('/api/admin/storage/audit', {}, secret);
  },
  getLocalImportFiles(secret: string, kind: LocalImportKind) {
    const encodedKind = encodeURIComponent(kind);
    return jsonRequest<LocalImportFilesResponse>(`/api/admin/local-import/files?kind=${encodedKind}`, {}, secret);
  },
  getVisitorStats(secret: string) {
    return jsonRequest<{
      success: boolean;
      today: string;
      todayUnique: number;
      yesterday: string;
      yesterdayUnique: number;
      topSourcesToday: Array<{
        key: string;
        label: string;
        count: number;
        ratio: number;
      }>;
      topSourcesYesterday: Array<{
        key: string;
        label: string;
        count: number;
        ratio: number;
      }>;
      topRegionsToday: Array<{
        key: string;
        label: string;
        count: number;
        ratio: number;
      }>;
      topRegionsYesterday: Array<{
        key: string;
        label: string;
        count: number;
        ratio: number;
      }>;
    }>('/api/admin/stats/visitors', {}, secret);
  },
  cleanupStorage(secret: string, body: any) {
    return jsonRequest<any>(
      '/api/admin/storage/cleanup',
      {
        method: 'POST',
        body: JSON.stringify(body || {}),
      },
      secret,
    );
  },
  uploadAssets(secret: string, entryId: string, files: any[], options: UploadOptions = {}) {
    return jsonUploadRequest<any>('/api/assets/upload', {entryId, files}, secret, options);
  },
  getPdfs() {
    return jsonRequest<any>('/api/pdfs');
  },
  getVibecodingProjects() {
    return jsonRequest<VibecodingListResponse>('/api/vibecoding');
  },
  getVibecodingProject(slug: string) {
    return jsonRequest<{success: boolean; project: VibecodingProject}>(`/api/vibecoding/${encodeURIComponent(slug)}`);
  },
  getJournals() {
    return jsonRequest<JournalListResponse>('/api/journals');
  },
  getJournal(id: string) {
    return jsonRequest<{success: boolean; journal: JournalRecord}>(`/api/journals/${id}`);
  },
  createJournal(secret: string, body: any) {
    return jsonRequest<{success: boolean; journal: JournalRecord}>(
      '/api/admin/journals',
      {
        method: 'POST',
        body: JSON.stringify(body || {}),
      },
      secret,
    );
  },
  updateJournal(secret: string, id: string, body: any) {
    return jsonRequest<{success: boolean; journal: JournalRecord}>(
      `/api/admin/journals/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(body || {}),
      },
      secret,
    );
  },
  deleteJournal(secret: string, id: string) {
    return jsonRequest<{success: boolean; id: string}>(
      `/api/admin/journals/${id}`,
      {
        method: 'DELETE',
      },
      secret,
    );
  },
  uploadJournalImage(secret: string, journalId: string, files: any[], options: UploadOptions = {}) {
    return jsonUploadRequest<any>('/api/admin/journals/upload', {journalId, files}, secret, options);
  },
  getVibecodingImports(secret: string) {
    return jsonRequest<VibecodingImportsResponse>('/api/admin/vibecoding/imports', {}, secret);
  },
  createVibecodingProject(secret: string, body: any) {
    return jsonRequest<{success: boolean; project: VibecodingProject}>(
      '/api/admin/vibecoding',
      {
        method: 'POST',
        body: JSON.stringify(body || {}),
      },
      secret,
    );
  },
  updateVibecodingProject(secret: string, id: string, body: any) {
    return jsonRequest<{success: boolean; project: VibecodingProject}>(
      `/api/admin/vibecoding/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(body || {}),
      },
      secret,
    );
  },
  deleteVibecodingProject(secret: string, id: string) {
    return jsonRequest<{success: boolean; id: string}>(
      `/api/admin/vibecoding/${id}`,
      {
        method: 'DELETE',
      },
      secret,
    );
  },
  createPdf(secret: string, body: any) {
    return jsonRequest<any>(
      '/api/pdfs',
      {
        method: 'POST',
        body: JSON.stringify(body || {}),
      },
      secret,
    );
  },
  updatePdf(secret: string, id: string, body: any) {
    return jsonRequest<any>(
      `/api/pdfs/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(body || {}),
      },
      secret,
    );
  },
  deletePdf(secret: string, id: string) {
    return jsonRequest<any>(
      `/api/pdfs/${id}`,
      {
        method: 'DELETE',
      },
      secret,
    );
  },
  async uploadPdf(secret: string, pdfId: string, file: File, options: UploadOptions = {}) {
    const fd = new FormData();
    fd.append('pdfId', pdfId);
    fd.append('pdf', file, file.name);
    return xhrUploadRequest<any>({
      url: '/api/pdfs/upload',
      method: 'POST',
      body: fd,
      adminSecret: secret,
      onProgress: options.onProgress,
    });
  },
  async uploadTimelineVideo(secret: string, entryId: string, file: File, options: UploadOptions = {}) {
    const fd = new FormData();
    fd.append('entryId', entryId);
    fd.append('video', file, file.name);
    return xhrUploadRequest<any>({
      url: '/api/timeline/video-upload',
      method: 'POST',
      body: fd,
      adminSecret: secret,
      onProgress: options.onProgress,
    });
  },
  uploadAwardImage(secret: string, awardId: string, files: any[], options: UploadOptions = {}) {
    return jsonUploadRequest<any>('/api/awards/upload', {awardId, files}, secret, options);
  },
  uploadAwardThumbnail(secret: string, awardId: string, thumbData: string) {
    return jsonRequest<any>(
      '/api/awards/thumbnail',
      {
        method: 'POST',
        body: JSON.stringify({awardId, thumbData}),
      },
      secret,
    );
  },
  uploadTimelineThumbnail(secret: string, entryId: string, thumbData: string) {
    return jsonRequest<any>(
      '/api/timeline/thumbnail',
      {
        method: 'POST',
        body: JSON.stringify({entryId, thumbData}),
      },
      secret,
    );
  },
  uploadPdfCover(secret: string, pdfId: string, files: any[], options: UploadOptions = {}) {
    return jsonUploadRequest<any>('/api/pdfs/cover-upload', {pdfId, files}, secret, options);
  },
};
