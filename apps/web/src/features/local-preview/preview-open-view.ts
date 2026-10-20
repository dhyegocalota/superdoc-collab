import type { BootstrapProgress } from '@superdoc-collab/types';
import { OpenStage } from '@/features/open-progress/open-stage';
import type { OpenProgressView } from '@/features/open-progress/open-progress-panel';

export function previewOpenView(parameters: {
  bootstrap: BootstrapProgress | null;
  pageCount: number;
  elapsedSeconds: number;
  startedAt: number;
  answeredAt: number;
}): OpenProgressView {
  return { stage: OpenStage.Preparing, detail: '', fraction: null };
}
