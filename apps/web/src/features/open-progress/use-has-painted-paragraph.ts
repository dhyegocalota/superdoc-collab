import { useEffect, useState } from 'react';
import { FIRST_FRAGMENT_SELECTOR } from '@/features/editor/use-caret-on-open';

export function useHasPaintedParagraph(container: HTMLElement | null): boolean {
  const [paintedContainer, setPaintedContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!container) return;
    const root: HTMLElement = container;
    if (root.querySelector(FIRST_FRAGMENT_SELECTOR)) return setPaintedContainer(root);
    const observer = new MutationObserver(() => {
      if (!root.querySelector(FIRST_FRAGMENT_SELECTOR)) return;
      setPaintedContainer(root);
      observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [container]);

  return container !== null && paintedContainer === container;
}
