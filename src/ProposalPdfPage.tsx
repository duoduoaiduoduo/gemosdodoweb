import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {CSSProperties, FC, PointerEvent as ReactPointerEvent, ReactNode} from 'react';
import {
  Eraser,
  Highlighter,
  MousePointer2,
  PenLine,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ProposalTool = 'select' | 'pen' | 'text' | 'rect' | 'highlight' | 'eraser';

type ProposalPoint = {
  x: number;
  y: number;
};

type ProposalRect = ProposalPoint & {
  w: number;
  h: number;
};

export type ProposalAnnotation = {
  id: string;
  pageIndex: number;
  type: 'pen' | 'rect' | 'highlight' | 'text';
  points?: ProposalPoint[];
  rect?: ProposalRect;
  text?: string;
  color: string;
  strokeWidth: number;
  fontSize: number;
  createdAt: string;
  updatedAt: string;
};

type ProposalPayload = {
  success: boolean;
  version: number;
  updatedAt: string;
  annotations: ProposalAnnotation[];
};

type PdfDocument = any;
type PdfPage = any;

const PDF_URL = '/proposal-assets/current.pdf';
const ANNOTATIONS_URL = '/api/proposal/annotations';
const DEFAULT_COLOR = '#ef4444';
const DEFAULT_HIGHLIGHT = '#facc15';

const toolLabels: Record<ProposalTool, string> = {
  select: '选择',
  pen: '画笔',
  text: '文字',
  rect: '矩形',
  highlight: '高亮',
  eraser: '删除',
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const createId = () =>
  `proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const nowIso = () => new Date().toISOString();

const normalizeRect = (a: ProposalPoint, b: ProposalPoint): ProposalRect => {
  const x = clamp(Math.min(a.x, b.x));
  const y = clamp(Math.min(a.y, b.y));
  const right = clamp(Math.max(a.x, b.x));
  const bottom = clamp(Math.max(a.y, b.y));
  return {
    x,
    y,
    w: Math.max(0.003, right - x),
    h: Math.max(0.003, bottom - y),
  };
};

const rgbaFromHex = (hex: string, alpha: number) => {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(250, 204, 21, ${alpha})`;
  const n = Number.parseInt(clean, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getLiveUrl = () => {
  const {protocol, hostname, port, host} = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  const devPort = hostname === 'localhost' || hostname === '127.0.0.1'
    ? port === '3000' || port === '5173'
    : false;
  const targetHost = devPort ? `${hostname}:3001` : host;
  return `${wsProtocol}://${targetHost}/api/proposal/live`;
};

type ToolButtonProps = {
  tool: ProposalTool;
  activeTool: ProposalTool;
  onClick: (tool: ProposalTool) => void;
  children: ReactNode;
};

const ToolButton: FC<ToolButtonProps> = ({
  tool,
  activeTool,
  onClick,
  children,
}) => {
  return (
    <button
      type="button"
      className={`proposal-tool-btn ${activeTool === tool ? 'active' : ''}`}
      onClick={() => onClick(tool)}
      title={toolLabels[tool]}
      aria-label={toolLabels[tool]}
    >
      {children}
    </button>
  );
};

function usePdfDocument() {
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let canceled = false;
    const task = pdfjsLib.getDocument({url: PDF_URL});
    task.promise
      .then((doc) => {
        if (canceled) return;
        setPdf(doc);
        setPageCount(doc.numPages);
      })
      .catch((err) => {
        if (!canceled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      canceled = true;
      void task.destroy();
    };
  }, []);

  return {pdf, pageCount, error};
}

type PdfCanvasPageProps = {
  pdf: PdfDocument;
  pageIndex: number;
  annotations: ProposalAnnotation[];
  selectedId: string | null;
  draftAnnotation: ProposalAnnotation | null;
  tool: ProposalTool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  onCommit: (next: ProposalAnnotation) => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onStartPageInteraction: (pageIndex: number) => void;
};

const PdfCanvasPage: FC<PdfCanvasPageProps> = ({
  pdf,
  pageIndex,
  annotations,
  selectedId,
  draftAnnotation,
  tool,
  color,
  strokeWidth,
  fontSize,
  onCommit,
  onSelect,
  onDelete,
  onTextChange,
  onStartPageInteraction,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const activeDraftRef = useRef<ProposalAnnotation | null>(null);
  const [page, setPage] = useState<PdfPage | null>(null);
  const [baseSize, setBaseSize] = useState({width: 800, height: 1035});
  const [stageSize, setStageSize] = useState({width: 800, height: 1035});
  const [localDraft, setLocalDraft] = useState<ProposalAnnotation | null>(null);

  useEffect(() => {
    let canceled = false;
    pdf.getPage(pageIndex + 1).then((nextPage) => {
      if (canceled) return;
      const viewport = nextPage.getViewport({scale: 1});
      setPage(nextPage);
      setBaseSize({width: viewport.width, height: viewport.height});
    });
    return () => {
      canceled = true;
    };
  }, [pageIndex, pdf]);

  useEffect(() => {
    const host = stageRef.current?.parentElement;
    if (!host) return;
    const update = () => {
      const maxWidth = baseSize.width;
      const available = host.clientWidth || maxWidth;
      const width = Math.max(280, Math.min(maxWidth, available));
      setStageSize({
        width,
        height: width * (baseSize.height / baseSize.width),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [baseSize.height, baseSize.width]);

  useEffect(() => {
    if (!page || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const scale = stageSize.width / baseSize.width;
    const viewport = page.getViewport({scale: scale * dpr});
    const cssViewport = page.getViewport({scale});
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${cssViewport.width}px`;
    canvas.style.height = `${cssViewport.height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    const renderTask = page.render({canvasContext: context, viewport});
    return () => {
      renderTask.cancel();
    };
  }, [baseSize.width, page, stageSize.width]);

  const pageAnnotations = useMemo(
    () => annotations.filter((item) => item.pageIndex === pageIndex),
    [annotations, pageIndex],
  );

  const toPagePoint = (event: ReactPointerEvent): ProposalPoint | null => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onStartPageInteraction(pageIndex);
    const point = toPagePoint(event);
    if (!point) return;
    if (tool === 'select') {
      onSelect(null);
      return;
    }
    if (tool === 'eraser') return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const createdAt = nowIso();
    if (tool === 'text') {
      const annotation: ProposalAnnotation = {
        id: createId(),
        pageIndex,
        type: 'text',
        rect: {x: point.x, y: point.y, w: 0.22, h: 0.055},
        text: '写一点批注',
        color,
        strokeWidth,
        fontSize,
        createdAt,
        updatedAt: createdAt,
      };
      onCommit(annotation);
      onSelect(annotation.id);
      return;
    }

    const annotation: ProposalAnnotation =
      tool === 'pen'
        ? {
            id: createId(),
            pageIndex,
            type: 'pen',
            points: [point],
            color,
            strokeWidth,
            fontSize,
            createdAt,
            updatedAt: createdAt,
          }
        : {
            id: createId(),
            pageIndex,
            type: tool,
            rect: {x: point.x, y: point.y, w: 0.003, h: 0.003},
            color: tool === 'highlight' ? color || DEFAULT_HIGHLIGHT : color,
            strokeWidth,
            fontSize,
            createdAt,
            updatedAt: createdAt,
          };
    activeDraftRef.current = annotation;
    setLocalDraft(annotation);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const draft = activeDraftRef.current;
    if (!draft) return;
    const point = toPagePoint(event);
    if (!point) return;
    if (draft.type === 'pen') {
      const next = {
        ...draft,
        points: [...(draft.points || []), point],
        updatedAt: nowIso(),
      };
      activeDraftRef.current = next;
      setLocalDraft(next);
      return;
    }
    const start = draft.rect ? {x: draft.rect.x, y: draft.rect.y} : point;
    const next = {
      ...draft,
      rect: normalizeRect(start, point),
      updatedAt: nowIso(),
    };
    activeDraftRef.current = next;
    setLocalDraft(next);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const draft = activeDraftRef.current;
    if (!draft) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    activeDraftRef.current = null;
    setLocalDraft(null);
    if (draft.type === 'pen' && (!draft.points || draft.points.length < 2)) return;
    onCommit(draft);
    onSelect(draft.id);
  };

  const visibleAnnotations = localDraft
    ? [...pageAnnotations, localDraft]
    : pageAnnotations;
  const overlayAnnotations = draftAnnotation && draftAnnotation.pageIndex === pageIndex
    ? [...visibleAnnotations, draftAnnotation]
    : visibleAnnotations;

  return (
    <section className="proposal-page-wrap" aria-label={`PDF page ${pageIndex + 1}`}>
      <div
        ref={stageRef}
        className="proposal-page-stage"
        style={{width: stageSize.width, height: stageSize.height}}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <canvas ref={canvasRef} className="proposal-page-canvas" />
        <div className="proposal-annotation-layer">
          {overlayAnnotations.map((annotation) => (
            <AnnotationView
              key={annotation.id}
              annotation={annotation}
              width={stageSize.width}
              height={stageSize.height}
              selected={selectedId === annotation.id}
              tool={tool}
              onSelect={onSelect}
              onDelete={onDelete}
              onTextChange={onTextChange}
            />
          ))}
        </div>
      </div>
      <div className="proposal-page-number">{pageIndex + 1}</div>
    </section>
  );
};

type AnnotationViewProps = {
  annotation: ProposalAnnotation;
  width: number;
  height: number;
  selected: boolean;
  tool: ProposalTool;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
};

const AnnotationView: FC<AnnotationViewProps> = ({
  annotation,
  width,
  height,
  selected,
  tool,
  onSelect,
  onDelete,
  onTextChange,
}) => {
  const handlePointerDown = (event: ReactPointerEvent) => {
    event.stopPropagation();
    if (tool === 'eraser') {
      onDelete(annotation.id);
      return;
    }
    onSelect(annotation.id);
  };

  if (annotation.type === 'pen') {
    const points = annotation.points || [];
    const d = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * width} ${point.y * height}`)
      .join(' ');
    return (
      <svg className="proposal-annotation-svg" viewBox={`0 0 ${width} ${height}`} onPointerDown={handlePointerDown}>
        <path
          d={d}
          fill="none"
          stroke={annotation.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={annotation.strokeWidth}
          className={selected ? 'selected' : ''}
        />
      </svg>
    );
  }

  if (!annotation.rect) return null;
  const rectStyle: CSSProperties = {
    left: `${annotation.rect.x * 100}%`,
    top: `${annotation.rect.y * 100}%`,
    width: `${annotation.rect.w * 100}%`,
    height: `${annotation.rect.h * 100}%`,
  };

  if (annotation.type === 'text') {
    return (
      <div
        className={`proposal-text-note ${selected ? 'selected' : ''}`}
        style={{
          ...rectStyle,
          color: annotation.color,
          fontSize: annotation.fontSize,
        }}
        onPointerDown={handlePointerDown}
      >
        {selected ? (
          <textarea
            value={annotation.text || ''}
            onChange={(event) => onTextChange(annotation.id, event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            autoFocus
          />
        ) : (
          <div>{annotation.text || ' '}</div>
        )}
      </div>
    );
  }

  if (annotation.type === 'highlight') {
    return (
      <div
        className={`proposal-highlight-note ${selected ? 'selected' : ''}`}
        style={{
          ...rectStyle,
          background: rgbaFromHex(annotation.color, 0.3),
          borderColor: rgbaFromHex(annotation.color, 0.78),
        }}
        onPointerDown={handlePointerDown}
      />
    );
  }

  return (
    <div
      className={`proposal-rect-note ${selected ? 'selected' : ''}`}
      style={{
        ...rectStyle,
        borderColor: annotation.color,
        borderWidth: Math.max(1, annotation.strokeWidth),
      }}
      onPointerDown={handlePointerDown}
    />
  );
};

export default function ProposalPdfPage() {
  const {pdf, pageCount, error: pdfError} = usePdfDocument();
  const [annotations, setAnnotations] = useState<ProposalAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ProposalTool>('select');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fontSize, setFontSize] = useState(18);
  const [currentPage, setCurrentPage] = useState(0);
  const [version, setVersion] = useState(0);
  const [saveState, setSaveState] = useState('加载中');
  const [liveState, setLiveState] = useState('连接中');
  const [future, setFuture] = useState<ProposalAnnotation[][]>([]);
  const [past, setPast] = useState<ProposalAnnotation[][]>([]);
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);

  const selectedAnnotation = useMemo(
    () => annotations.find((item) => item.id === selectedId) || null,
    [annotations, selectedId],
  );

  const saveAnnotations = useCallback(async (nextAnnotations: ProposalAnnotation[]) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      savingRef.current = true;
      setSaveState('保存中');
      try {
        const res = await fetch(ANNOTATIONS_URL, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({annotations: nextAnnotations}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as ProposalPayload;
        setVersion(payload.version || 0);
        setSaveState('已保存');
      } catch (err) {
        setSaveState(err instanceof Error ? `保存失败 ${err.message}` : '保存失败');
      } finally {
        savingRef.current = false;
      }
    }, 320);
  }, []);

  const commitAnnotations = useCallback((next: ProposalAnnotation[]) => {
    setPast((prev) => [...prev.slice(-49), annotations]);
    setFuture([]);
    setAnnotations(next);
    void saveAnnotations(next);
  }, [annotations, saveAnnotations]);

  const addAnnotation = useCallback((annotation: ProposalAnnotation) => {
    commitAnnotations([...annotations, annotation]);
  }, [annotations, commitAnnotations]);

  const deleteAnnotation = useCallback((id: string) => {
    const next = annotations.filter((item) => item.id !== id);
    commitAnnotations(next);
    setSelectedId((prev) => (prev === id ? null : prev));
  }, [annotations, commitAnnotations]);

  const updateText = useCallback((id: string, text: string) => {
    setAnnotations((prev) => {
      const next = prev.map((item) =>
        item.id === id ? {...item, text, updatedAt: nowIso()} : item,
      );
      void saveAnnotations(next);
      return next;
    });
  }, [saveAnnotations]);

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [annotations, ...prev].slice(0, 50));
    setAnnotations(previous);
    void saveAnnotations(previous);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev.slice(-49), annotations]);
    setAnnotations(next);
    void saveAnnotations(next);
  };

  const clearCurrentPage = () => {
    const next = annotations.filter((item) => item.pageIndex !== currentPage);
    commitAnnotations(next);
    setSelectedId(null);
  };

  useEffect(() => {
    let canceled = false;
    fetch(ANNOTATIONS_URL)
      .then((res) => res.json())
      .then((payload: ProposalPayload) => {
        if (canceled) return;
        setAnnotations(Array.isArray(payload.annotations) ? payload.annotations : []);
        setVersion(payload.version || 0);
        setSaveState('已加载');
      })
      .catch((err) => {
        if (!canceled) setSaveState(err instanceof Error ? `加载失败 ${err.message}` : '加载失败');
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    const socket = new WebSocket(getLiveUrl());
    socket.onopen = () => setLiveState('实时已连接');
    socket.onclose = () => setLiveState('实时已断开');
    socket.onerror = () => setLiveState('实时连接失败');
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        const payload = message?.payload as ProposalPayload;
        if (message?.type !== 'snapshot' || !Array.isArray(payload?.annotations)) return;
        if (savingRef.current) return;
        setAnnotations(payload.annotations);
        setVersion(payload.version || 0);
        setSaveState('已同步');
      } catch {
        // Ignore malformed live messages.
      }
    };
    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <main className="proposal-page">
      <aside className="proposal-toolbar" aria-label="PDF 标注工具">
        <div className="proposal-toolbar-group">
          <ToolButton tool="select" activeTool={tool} onClick={setTool}><MousePointer2 size={19} /></ToolButton>
          <ToolButton tool="pen" activeTool={tool} onClick={setTool}><PenLine size={19} /></ToolButton>
          <ToolButton tool="text" activeTool={tool} onClick={setTool}><Type size={19} /></ToolButton>
          <ToolButton tool="rect" activeTool={tool} onClick={setTool}><Square size={19} /></ToolButton>
          <ToolButton tool="highlight" activeTool={tool} onClick={setTool}><Highlighter size={19} /></ToolButton>
          <ToolButton tool="eraser" activeTool={tool} onClick={setTool}><Eraser size={19} /></ToolButton>
        </div>

        <div className="proposal-toolbar-group proposal-tool-inputs">
          <label title="颜色">
            <span>色</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
          <label title="线宽">
            <span>线</span>
            <input
              type="range"
              min="1"
              max="18"
              value={strokeWidth}
              onChange={(event) => setStrokeWidth(Number(event.target.value))}
            />
          </label>
          <label title="字号">
            <span>字</span>
            <input
              type="range"
              min="12"
              max="42"
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="proposal-toolbar-group">
          <button type="button" className="proposal-tool-btn" onClick={undo} disabled={past.length === 0} title="撤销">
            <Undo2 size={19} />
          </button>
          <button type="button" className="proposal-tool-btn" onClick={redo} disabled={future.length === 0} title="重做">
            <Redo2 size={19} />
          </button>
          <button
            type="button"
            className="proposal-tool-btn"
            onClick={() => selectedId && deleteAnnotation(selectedId)}
            disabled={!selectedId}
            title="删除选中"
          >
            <Trash2 size={19} />
          </button>
        </div>

        <button type="button" className="proposal-clear-page" onClick={clearCurrentPage}>
          清空第 {currentPage + 1} 页
        </button>

        <div className="proposal-status">
          <span>{toolLabels[tool]}</span>
          <span>{saveState}</span>
          <span>{liveState}</span>
          <span>v{version}</span>
        </div>
      </aside>

      <section className="proposal-document" aria-label="开题 PDF">
        {pdfError ? <div className="proposal-load-error">{pdfError}</div> : null}
        {!pdf && !pdfError ? <div className="proposal-loading">正在加载 PDF...</div> : null}
        {pdf
          ? Array.from({length: pageCount}, (_, pageIndex) => (
              <PdfCanvasPage
                key={pageIndex}
                pdf={pdf}
                pageIndex={pageIndex}
                annotations={annotations}
                selectedId={selectedId}
                draftAnnotation={null}
                tool={tool}
                color={tool === 'highlight' ? DEFAULT_HIGHLIGHT : color}
                strokeWidth={strokeWidth}
                fontSize={fontSize}
                onCommit={addAnnotation}
                onSelect={setSelectedId}
                onDelete={deleteAnnotation}
                onTextChange={updateText}
                onStartPageInteraction={setCurrentPage}
              />
            ))
          : null}
      </section>

      {selectedAnnotation ? (
        <div className="proposal-selection-pill">
          已选中 {selectedAnnotation.type === 'text' ? '文字' : selectedAnnotation.type}
        </div>
      ) : null}
    </main>
  );
}
