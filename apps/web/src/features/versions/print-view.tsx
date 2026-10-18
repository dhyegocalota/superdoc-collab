import { AppRoute, PRINT_READY_TIMEOUT_MS } from '@superdoc-collab/types';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWindowMessage } from '@/lib/use-window-message';
import { PrintMessageKind, readPrintMessage } from './print-messages';

const LETTER_PAGE_WIDTH_PX = 816;
const LETTER_PAGE_HEIGHT_PX = 1056;

export function PrintView({ file, onClose, onFailed }: { file: Blob; onClose: () => void; onFailed: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [isPainted, setIsPainted] = useState(false);

  useEffect(() => {
    if (isPainted) return;
    const timeout = setTimeout(onFailed, PRINT_READY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isPainted, onFailed]);

  useWindowMessage((event) => {
    const frameWindow = frameRef.current ? frameRef.current.contentWindow : null;
    const message = readPrintMessage({ event, expectedSource: frameWindow });
    if (message === null || frameWindow === null) return;
    if (message.kind === PrintMessageKind.Ready) frameWindow.postMessage({ kind: PrintMessageKind.Load, file }, window.location.origin);
    if (message.kind === PrintMessageKind.PageCount) setPageCount(message.pageCount);
    if (message.kind === PrintMessageKind.Failed) onFailed();
    if (message.kind === PrintMessageKind.Closed) onClose();
    if (message.kind !== PrintMessageKind.Painted) return;
    setIsPainted(true);
    frameWindow.postMessage({ kind: PrintMessageKind.Print }, window.location.origin);
  });

  return createPortal(
    <iframe
      ref={frameRef}
      src={AppRoute.Print}
      title=""
      aria-hidden
      tabIndex={-1}
      data-print-view=""
      className="fixed top-0 -left-[10000px] border-0"
      style={{ width: LETTER_PAGE_WIDTH_PX, height: pageCount * LETTER_PAGE_HEIGHT_PX }}
    />,
    document.body,
  );
}
