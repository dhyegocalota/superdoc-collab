import type { EditRunView } from '@superdoc-history/types';
import { useEffect } from 'react';
import type { SuperDoc } from 'superdoc';
import { clearHighlights, highlightEdits } from '@/features/editor/highlight-edits';

export function useRunHighlights({ superdoc, runs }: { superdoc: SuperDoc | null; runs: EditRunView[] }): void {
  useEffect(() => {
    const document = superdoc?.activeEditor?.doc;
    if (!document) return;
    let commentIds: string[] = [];
    let isCancelled = false;
    highlightEdits({ document, runs }).then((result) => {
      commentIds = result.commentIds;
      if (isCancelled) clearHighlights({ document, commentIds });
    });
    return () => {
      isCancelled = true;
      clearHighlights({ document, commentIds });
    };
  }, [superdoc, runs]);
}
