import type { DocumentRole } from '@superdoc-collab/types';

export function EditorToolbarRow(_props: {
  role: DocumentRole;
  containerRef: (element: HTMLDivElement | null) => void;
  isToolbarInert: boolean;
  isRunning: boolean;
  onSummarize: () => void;
}): never {
  throw new Error('EditorToolbarRow is not implemented');
}
