import type { ConnectionState } from '@superdoc-collab/types';

type ThumbnailCaptureInput = {
  documentId: string;
  isReader: boolean;
  connectionState: ConnectionState;
  lastEditAt: number | null;
  editorContainer: HTMLElement | null;
};

export function useThumbnailCapture(input: ThumbnailCaptureInput): void {
  void input;
}
