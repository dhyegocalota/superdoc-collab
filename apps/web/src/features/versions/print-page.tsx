import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { printSuperdocOptions } from '@/features/editor/superdoc-options';
import { useWindowMessage } from '@/lib/use-window-message';
import { PrintMessageKind, readPrintMessage, type PrintMessage } from './print-messages';

const PAGE_SELECTOR = '.superdoc-page';
const LETTER_PAGE_WIDTH_PX = 816;
const PRINT_READY_MAX_FRAMES = 600;
const PRINT_STYLES = '@page { size: Letter; margin: 0 } html, body { margin: 0 }';

function postToParent(message: PrintMessage): void {
  window.parent.postMessage(message, window.location.origin);
}

function isLastPagePainted({ container, pageCount }: { container: HTMLElement; pageCount: number }): boolean {
  const pages = container.querySelectorAll(PAGE_SELECTOR);
  const lastPageText = pages.item(pages.length - 1)?.textContent;
  const hasAllPages = pages.length >= pageCount;
  return hasAllPages && lastPageText !== undefined && lastPageText.trim() !== '';
}

export function PrintPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);

  useEffect(() => postToParent({ kind: PrintMessageKind.Ready }), []);

  useWindowMessage((event) => {
    const message = readPrintMessage({ event, expectedSource: window.parent });
    if (message === null || message.kind !== PrintMessageKind.Load) return;
    setFile(message.file);
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
    const expectedPageCount: number = pageCount;
    let frame = 0;
    let frameRequest = 0;
    function waitForLastPage(): void {
      if (isLastPagePainted({ container: printContainer, pageCount: expectedPageCount }))
        return postToParent({ kind: PrintMessageKind.Painted });
      frame += 1;
      if (frame > PRINT_READY_MAX_FRAMES) return postToParent({ kind: PrintMessageKind.Failed });
      frameRequest = requestAnimationFrame(waitForLastPage);
    }
    frameRequest = requestAnimationFrame(waitForLastPage);
    return () => cancelAnimationFrame(frameRequest);
  }, [pageCount]);

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <div ref={containerRef} style={{ width: LETTER_PAGE_WIDTH_PX }} />
    </>
  );
}
