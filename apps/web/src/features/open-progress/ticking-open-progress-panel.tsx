import type { ReactNode } from 'react';
import { OpenProgressPanel, type OpenProgressView } from './open-progress-panel';
import type { OpenStage } from './open-stage';
import { useElapsedSeconds } from './use-elapsed-seconds';

export type OpenProgressViewAt = (elapsedSeconds: number) => OpenProgressView;

type TickingOpenProgressPanelProps = {
  title: string | null;
  stages: OpenStage[];
  startedAt: number;
  viewAt: OpenProgressViewAt;
  action: ReactNode;
};

export function TickingOpenProgressPanel({ title, stages, startedAt, viewAt, action }: TickingOpenProgressPanelProps) {
  const elapsedSeconds = useElapsedSeconds(startedAt);
  return <OpenProgressPanel title={title} stages={stages} view={viewAt(elapsedSeconds)} action={action} />;
}
