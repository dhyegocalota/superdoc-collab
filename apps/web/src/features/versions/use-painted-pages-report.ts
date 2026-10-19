import { isBlank } from '@superdoc-collab/types';
import { useEffect, type RefObject } from 'react';
import { PrintMessageKind, postToParent } from './print-messages';

export const PAGE_SELECTOR = '.superdoc-page';

function arePagesPainted({ container, pageCount }: { container: HTMLElement; pageCount: number }): boolean {
  const pages = [...container.querySelectorAll(PAGE_SELECTOR)];
  const hasAllPages = pages.length >= pageCount;
  return hasAllPages && pages.every((page) => page.textContent !== null && !isBlank(page.textContent));
}

export function usePaintedPagesReport({
  containerRef,
  pageCount,
}: {
  containerRef: RefObject<HTMLElement | null>;
  pageCount: number | null;
}): void {
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
  }, [containerRef, pageCount]);
}
