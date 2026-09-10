import {useEffect, useRef, useState, type FC} from 'react';
import * as pdfjs from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {Language} from './types';
import {localized} from './types';

pdfjs.GlobalWorkerOptions.workerSrc = worker;

const Page: FC<{document: PDFDocumentProxy; index: number; lang: Language}> = ({document, index, lang}) => {
  const ref = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [nearby, setNearby] = useState(index === 1);
  const [ratio, setRatio] = useState(0.707);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), {rootMargin: '700px'});
    observer.observe(element);
    const resize = new ResizeObserver(() => setWidth(element.clientWidth));
    resize.observe(element);
    return () => {observer.disconnect(); resize.disconnect();};
  }, []);
  useEffect(() => {
    if (!nearby || !width) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    document.getPage(index).then(async (page) => {
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({scale: 1});
      setRatio(base.width / base.height);
      const viewport = page.getViewport({scale: width / base.width * Math.min(window.devicePixelRatio || 1, 2)});
      const element = canvas.current;
      element.width = viewport.width;
      element.height = viewport.height;
      task = page.render({canvas: element, viewport});
      await task.promise;
    }).catch((error) => {if (!cancelled && error?.name !== 'RenderingCancelledException') setFailed(true);});
    return () => {cancelled = true; task?.cancel();};
  }, [document, index, nearby, width]);
  return <figure className="mi-pdf-page">
    <div ref={ref} style={{aspectRatio: ratio}}>
      {failed ? <p>{localized(lang, '这一页暂时无法显示，请打开原文件查看。', 'This page could not be displayed. Please open the original file.')}</p> : <canvas ref={canvas} role="img" aria-label={localized(lang, `第 ${index} 页`, `Page ${index}`)} />}
    </div>
    <figcaption>{index} / {document.numPages}</figcaption>
  </figure>;
}

export default function MobilePdfReader({url, lang}: {url: string; lang: Language}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setDocument(null);
    setFailed(false);
    let cancelled = false;
    const task = pdfjs.getDocument({url});
    task.promise.then((value) => {if (!cancelled) setDocument(value);}).catch(() => {if (!cancelled) setFailed(true);});
    return () => {cancelled = true; void task.destroy();};
  }, [url]);
  if (failed) return <div className="mi-state" role="alert"><p>{localized(lang, '预览暂时无法载入', 'Preview unavailable')}</p><a className="mi-text-action" href={url} target="_blank" rel="noopener noreferrer">{localized(lang, '打开 PDF 原文件', 'Open original PDF')}</a></div>;
  if (!document) return <div className="mi-state" role="status"><span className="mi-spinner" /><p>{localized(lang, '正在准备阅读…', 'Preparing your document…')}</p></div>;
  return <div className="mi-pdf-pages">{Array.from({length: document.numPages}, (_, i) => <Page key={i} document={document} index={i + 1} lang={lang} />)}</div>;
}
