import type { BootstrapProgress } from '@superdoc-collab/types';
import { detailLine, pagesSoFarDetail } from '@/features/open-progress/open-progress-copy';
import type { OpenProgressView } from '@/features/open-progress/open-progress-panel';
import { preparingView } from '@/features/open-progress/open-progress-view';
import { PREVIEW_OPENING_DETAIL } from './local-preview-copy';

export function previewOpenView({
  bootstrap,
  pageCount,
  elapsedSeconds,
  startedAt,
  answeredAt,
}: {
  bootstrap: BootstrapProgress | null;
  pageCount: number;
  elapsedSeconds: number;
  startedAt: number;
  answeredAt: number;
}): OpenProgressView {
  const serverView = preparingView({ bootstrap, elapsedSeconds, startedAt, answeredAt, preparedOnDeviceOf: null });
  const pages = pageCount > 0 ? [pagesSoFarDetail(pageCount)] : [];
  return { ...serverView, detail: detailLine([PREVIEW_OPENING_DETAIL, ...pages, serverView.detail]) };
}
