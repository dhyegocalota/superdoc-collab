import type { ReactNode } from 'react';
import { OpenStage } from './open-stage';

export type OpenProgressView = { stage: OpenStage; detail: string; fraction: number | null };

type OpenProgressPanelProps = { title: string | null; stages: OpenStage[]; view: OpenProgressView; action: ReactNode };

export function OpenProgressPanel(props: OpenProgressPanelProps): never {
  throw new Error('OpenProgressPanel is not implemented');
}
