import { useEffect, useRef, useState } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { printSuperdocOptions } from '@/features/editor/superdoc-options';
import { useWindowMessage } from '@/lib/use-window-message';
import { PrintMessageKind, postToParent, readPrintMessage } from './print-messages';
import { PAGE_SELECTOR, usePaintedPagesReport } from './use-painted-pages-report';

const LETTER_PAGE_WIDTH_PX = 816;
const PRINT_STYLES = '@page { size: Letter; margin: 0 } html, body { margin: 0 }';

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

  usePaintedPagesReport({ containerRef, pageCount });

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <div ref={containerRef} data-testid="print-page" style={{ width: LETTER_PAGE_WIDTH_PX }} />
    </>
  );
}
