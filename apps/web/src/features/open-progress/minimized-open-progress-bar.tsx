import { Maximize2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAXIMIZE_PROGRESS_LABEL, OPEN_STAGE_LABELS } from './open-progress-copy';
import type { OpenProgressView } from './open-progress-panel';

type MinimizedOpenProgressBarProps = {
  view: OpenProgressView;
  onMaximize: () => void;
};

export function MinimizedOpenProgressBar({ view, onMaximize }: MinimizedOpenProgressBarProps) {
  return (
    <div
      data-testid="open-progress"
      data-stage={view.stage}
      data-minimized="true"
      role="status"
      aria-live="polite"
      className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b bg-card/80 px-4 py-1 text-sm backdrop-blur-sm"
    >
      <span className="shrink-0 font-medium">{OPEN_STAGE_LABELS[view.stage]}</span>
      <span data-testid="open-progress-detail" aria-live="off" className="min-w-0 flex-1 truncate text-muted-foreground tabular-nums">
        {view.detail}
      </span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={MAXIMIZE_PROGRESS_LABEL} onClick={onMaximize}>
        <Maximize2Icon aria-hidden="true" />
      </Button>
    </div>
  );
}
