import type { BootstrapProgress } from '@superdoc-collab/types';

export type LocalPreviewProps = {
  title: string | null;
  file: File;
  bootstrap: BootstrapProgress | null;
  answeredAt: number;
  startedAt: number;
  isProgressShown: boolean;
};

export function LocalPreview(props: LocalPreviewProps) {
  return null;
}
