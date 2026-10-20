import { PERCENT_MULTIPLIER } from '@superdoc-collab/types';
import { CheckIcon, CircleIcon, Loader2Icon, Minimize2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { MINIMIZE_PROGRESS_LABEL, OPEN_PROGRESS_LABEL, OPEN_STAGE_LABELS, stageAnnouncement } from './open-progress-copy';
import { MinimizedOpenProgressBar } from './minimized-open-progress-bar';
import { OpenStage } from './open-stage';

export type OpenProgressView = { stage: OpenStage; detail: string; fraction: number | null };

type OpenProgressPanelProps = {
  title: string | null;
  stages: OpenStage[];
  view: OpenProgressView;
  action: ReactNode;
  isTranslucent?: boolean;
  minimization?: PanelMinimization;
};

export type PanelMinimization = { isMinimized: boolean; onMinimizedChange: (isMinimized: boolean) => void };

const TRANSLUCENT_CARD_CLASS = 'bg-card/80 backdrop-blur-sm';

enum StageState {
  Done = 'done',
  Current = 'current',
  Pending = 'pending',
}

const STAGE_ICONS: Record<StageState, ReactNode> = {
  [StageState.Done]: <CheckIcon aria-hidden="true" className="size-4 text-primary" />,
  [StageState.Current]: <Loader2Icon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />,
  [StageState.Pending]: <CircleIcon aria-hidden="true" className="size-4 text-muted-foreground" />,
};

function stageStateOf({ stages, stage, listed }: { stages: OpenStage[]; stage: OpenStage; listed: OpenStage }): StageState {
  const position = stages.indexOf(listed) - stages.indexOf(stage);
  if (position < 0) return StageState.Done;
  if (position === 0) return StageState.Current;
  return StageState.Pending;
}

export function progressValueOf(fraction: number | null): number | null {
  if (fraction === null) return null;
  return Math.round(fraction * PERCENT_MULTIPLIER);
}

export function OpenProgressPanel({ title, stages, view, action, isTranslucent = false, minimization }: OpenProgressPanelProps) {
  if (minimization?.isMinimized) return <MinimizedOpenProgressBar view={view} onMaximize={() => minimization.onMinimizedChange(false)} />;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
      <Card
        data-testid="open-progress"
        data-stage={view.stage}
        className={cn('w-full max-w-md gap-4', isTranslucent && TRANSLUCENT_CARD_CLASS)}
      >
        <CardContent role="status" aria-live="polite" className="flex flex-col gap-4">
          {(title || minimization) && (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold">{title}</p>
              {minimization && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={MINIMIZE_PROGRESS_LABEL}
                  onClick={() => minimization.onMinimizedChange(true)}
                >
                  <Minimize2Icon aria-hidden="true" />
                </Button>
              )}
            </div>
          )}
          <p className="sr-only">{stageAnnouncement({ stages, stage: view.stage })}</p>
          <ol className="flex flex-col gap-2 text-sm">
            {stages.map((listed) => {
              const state = stageStateOf({ stages, stage: view.stage, listed });
              return (
                <li
                  key={listed}
                  data-state={state}
                  aria-current={state === StageState.Current ? 'step' : undefined}
                  className={cn('flex items-center gap-2', state === StageState.Current ? 'font-medium' : 'text-muted-foreground')}
                >
                  {STAGE_ICONS[state]}
                  {OPEN_STAGE_LABELS[listed]}
                </li>
              );
            })}
          </ol>
          <Progress value={progressValueOf(view.fraction)} aria-label={OPEN_PROGRESS_LABEL} aria-valuetext={view.detail} />
          <p data-testid="open-progress-detail" aria-live="off" className="text-sm text-muted-foreground tabular-nums">
            {view.detail}
          </p>
        </CardContent>
        {action && <CardFooter className="flex-wrap gap-2">{action}</CardFooter>}
      </Card>
    </div>
  );
}
