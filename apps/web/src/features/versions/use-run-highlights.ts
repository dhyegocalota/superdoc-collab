import type { EditRunView } from '@superdoc-history/types';
import { useEffect } from 'react';
import type { SuperDoc } from 'superdoc';
import { clearHighlights, highlightEdits, type HighlightResult } from '@/features/editor/highlight-edits';

const EDITOR_UPDATE_EVENT = 'editor-update';

function wasEveryTargetSkipped(result: HighlightResult): boolean {
  return result.targetCount > 0 && result.skippedCount === result.targetCount;
}

export function useRunHighlights({ superdoc, runs }: { superdoc: SuperDoc | null; runs: EditRunView[] }): void {
  useEffect(() => {
    const editorDocument = superdoc?.activeEditor?.doc;
    if (!superdoc || !editorDocument) return;
    const activeSuperdoc = superdoc;
    const document = editorDocument;
    let commentIds: string[] = [];
    let isCancelled = false;

    function apply(): Promise<HighlightResult> {
      return highlightEdits({ document: document, runs }).then((result) => {
        commentIds = result.commentIds;
        if (isCancelled) clearHighlights({ document: document, commentIds });
        return result;
      });
    }

    function retryOnce(): void {
      activeSuperdoc.off(EDITOR_UPDATE_EVENT, retryOnce);
      if (isCancelled) return;
      apply().catch(() => clearHighlights({ document: document, commentIds }));
    }

    apply()
      .then((result) => {
        if (isCancelled || !wasEveryTargetSkipped(result)) return;
        activeSuperdoc.on(EDITOR_UPDATE_EVENT, retryOnce);
      })
      .catch(() => clearHighlights({ document, commentIds }));

    return () => {
      isCancelled = true;
      activeSuperdoc.off(EDITOR_UPDATE_EVENT, retryOnce);
      clearHighlights({ document, commentIds });
    };
  }, [superdoc, runs]);
}
