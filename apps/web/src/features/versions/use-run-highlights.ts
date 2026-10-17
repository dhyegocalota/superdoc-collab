import type { EditRunView } from '@superdoc-history/types';
import { useEffect } from 'react';
import type { SuperDoc } from 'superdoc';
import { clearHighlights, highlightEdits, type EditorDocument, type HighlightResult } from '@/features/editor/highlight-edits';

const EDITOR_UPDATE_EVENT = 'editor-update';

function wasEveryTargetSkipped(result: HighlightResult): boolean {
  return result.targetCount > 0 && result.skippedCount === result.targetCount;
}

function highlightUntilCancelled({
  superdoc,
  editorDocument,
  runs,
}: {
  superdoc: SuperDoc;
  editorDocument: EditorDocument;
  runs: EditRunView[];
}): () => void {
  let commentIds: string[] = [];
  let isCancelled = false;

  function apply(): Promise<HighlightResult> {
    return highlightEdits({ document: editorDocument, runs }).then((result) => {
      commentIds = result.commentIds;
      if (isCancelled) clearHighlights({ document: editorDocument, commentIds });
      return result;
    });
  }

  function retryOnce(): void {
    superdoc.off(EDITOR_UPDATE_EVENT, retryOnce);
    if (isCancelled) return;
    apply().catch(() => clearHighlights({ document: editorDocument, commentIds }));
  }

  apply()
    .then((result) => {
      if (isCancelled || !wasEveryTargetSkipped(result)) return;
      superdoc.on(EDITOR_UPDATE_EVENT, retryOnce);
    })
    .catch(() => clearHighlights({ document: editorDocument, commentIds }));

  return () => {
    isCancelled = true;
    superdoc.off(EDITOR_UPDATE_EVENT, retryOnce);
    clearHighlights({ document: editorDocument, commentIds });
  };
}

export function useRunHighlights({ superdoc, runs }: { superdoc: SuperDoc | null; runs: EditRunView[] }): void {
  useEffect(() => {
    const editorDocument = superdoc?.activeEditor?.doc;
    if (!superdoc || !editorDocument) return;
    return highlightUntilCancelled({ superdoc, editorDocument, runs });
  }, [superdoc, runs]);
}
