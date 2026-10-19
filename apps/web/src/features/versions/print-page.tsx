import { isBlank } from '@superdoc-collab/types';
import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { printSuperdocOptions } from '@/features/editor/superdoc-options';
import { useWindowMessage } from '@/lib/use-window-message';
import { PrintMessageKind, readPrintMessage, type PrintMessage } from './print-messages';

const PAGE_SELECTOR = '.superdoc-page';
const LETTER_PAGE_WIDTH_PX = 816;
const PRINT_STYLES = '@page { size: Letter; margin: 0 } html, body { margin: 0 }';

function postToParent(message: PrintMessage): void {
  window.parent.postMessage(message, window.location.origin);
}

function arePagesPainted({ container, pageCount }: { container: HTMLElement; pageCount: number }): boolean {
  const pages = [...container.querySelectorAll(PAGE_SELECTOR)];
  const hasAllPages = pages.length >= pageCount;
  return hasAllPages && pages.every((page) => page.textContent !== null && !isBlank(page.textContent));
}

export function PrintPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);

  useEffect(() => postToParent({ kind: PrintMessageKind.Ready }), []);

  useEffect(() => {
    function reportClosed(): void {
      postToParent({ kind: PrintMessageKind.Closed });
    }
    window.addEventListener('afterprint', reportClosed);
    return () => window.removeEventListener('afterprint', reportClosed);
  }, []);

  useWindowMessage((event) => {
    const message = readPrintMessage({ event, expectedSource: window.parent });
    if (message === null) return;
    if (message.kind === PrintMessageKind.Print) window.print();
    if (message.kind === PrintMessageKind.Load) setFile(message.file);
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || file === null) return;
    const superdoc = new SuperDoc({
      ...printSuperdocOptions({ container, file }),
      onReady: () => {
        const paintedPageCount = container.querySelectorAll(PAGE_SELECTOR).length;
        if (paintedPageCount === 0) return postToParent({ kind: PrintMessageKind.Failed });
        setPageCount(paintedPageCount);
        postToParent({ kind: PrintMessageKind.PageCount, pageCount: paintedPageCount });
      },
      onException: () => postToParent({ kind: PrintMessageKind.Failed }),
    });
    return () => superdoc.destroy();
  }, [file]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || pageCount === null) return;
    const printContainer: HTMLElement = container;
    let announcedPageCount: number = pageCount;
    let frameRequest = 0;
    function waitForPages(): void {
      const currentPageCount = printContainer.querySelectorAll(PAGE_SELECTOR).length;
      if (currentPageCount > announcedPageCount) {
        announcedPageCount = currentPageCount;
        postToParent({ kind: PrintMessageKind.PageCount, pageCount: currentPageCount });
      }
      if (arePagesPainted({ container: printContainer, pageCount: announcedPageCount }))
        return postToParent({ kind: PrintMessageKind.Painted });
      frameRequest = requestAnimationFrame(waitForPages);
    }
    frameRequest = requestAnimationFrame(waitForPages);
    return () => cancelAnimationFrame(frameRequest);
  }, [pageCount]);

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <div ref={containerRef} data-testid="print-page" style={{ width: LETTER_PAGE_WIDTH_PX }} />
    </>
  );
}
