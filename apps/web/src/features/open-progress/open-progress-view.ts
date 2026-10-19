import type { BootstrapProgress } from '@superdoc-collab/types';
import type { OpenProgressView } from './open-progress-panel';

export function uploadingView({ sentBytes, totalBytes }: { sentBytes: number; totalBytes: number }): OpenProgressView {
  throw new Error('uploadingView is not implemented');
}

export function preparingView({
  bootstrap,
  elapsedSeconds,
}: {
  bootstrap: BootstrapProgress | null;
  elapsedSeconds: number;
}): OpenProgressView {
  throw new Error('preparingView is not implemented');
}

export function downloadingView({ stateBytes, elapsedSeconds }: { stateBytes: number | null; elapsedSeconds: number }): OpenProgressView {
  throw new Error('downloadingView is not implemented');
}

export function renderingView({ pageCount, elapsedSeconds }: { pageCount: number; elapsedSeconds: number }): OpenProgressView {
  throw new Error('renderingView is not implemented');
}
