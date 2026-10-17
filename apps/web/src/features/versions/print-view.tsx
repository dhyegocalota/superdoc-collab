import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { printSuperdocOptions } from '@/features/editor/superdoc-options';

const PAGE_SELECTOR = '.superdoc-page';
const LETTER_PAGE_WIDTH_PX = 816;
const LETTER_PAGE_HEIGHT_PX = 1056;
const PRINT_READY_MAX_FRAMES = 600;
const PRINT_STYLES = `@page { size: Letter; margin: 0 }
@media print {
  body > :not([data-print-view]) { display: none !important }
  [data-print-view] { position: absolute !important; top: 0 !important; left: 0 !important }
}`;

function isLastPagePainted({ container, pageCount }: { container: HTMLElement; pageCount: number }): boolean {
  const pages = container.querySelectorAll(PAGE_SELECTOR);
  const lastPageText = pages.item(pages.length - 1)?.textContent;
  const hasAllPages = pages.length >= pageCount;
  return hasAllPages && lastPageText !== undefined && lastPageText.trim() !== '';
}

export function PrintView({ file, onClose, onFailed }: { file: Blob; onClose: () => void; onFailed: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const heightPx = pageCount === null ? LETTER_PAGE_HEIGHT_PX : pageCount * LETTER_PAGE_HEIGHT_PX;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const superdoc = new SuperDoc({
      ...printSuperdocOptions({ container, file }),
      onReady: () => {
        const paintedPageCount = container.querySelectorAll(PAGE_SELECTOR).length;
        if (paintedPageCount === 0) return onFailed();
        setPageCount(paintedPageCount);
      },
      onException: onFailed,
    });
    return () => superdoc.destroy();
  }, [file, onFailed]);

  useEffect(() => {
    window.addEventListener('afterprint', onClose);
    return () => window.removeEventListener('afterprint', onClose);
  }, [onClose]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || pageCount === null) return;
    const printContainer: HTMLElement = container;
    const expectedPageCount: number = pageCount;
    let frame = 0;
    let frameRequest = 0;
    function waitForLastPage(): void {
      if (isLastPagePainted({ container: printContainer, pageCount: expectedPageCount })) return window.print();
      frame += 1;
      if (frame > PRINT_READY_MAX_FRAMES) return onFailed();
      frameRequest = requestAnimationFrame(waitForLastPage);
    }
    frameRequest = requestAnimationFrame(waitForLastPage);
    return () => cancelAnimationFrame(frameRequest);
  }, [pageCount, onFailed]);

  return createPortal(
    <>
      <style>{PRINT_STYLES}</style>
      <div
        ref={containerRef}
        data-print-view=""
        aria-hidden
        inert
        className="fixed top-0 -left-[10000px]"
        style={{ width: LETTER_PAGE_WIDTH_PX, height: heightPx }}
      />
    </>,
    document.body,
  );
}
