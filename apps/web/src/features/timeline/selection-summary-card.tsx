import { secondsRoundedUp, SelectionSummaryState, type SelectionSummaryView } from '@superdoc-history/types';
import { useEffect, useId, useRef, type RefObject } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AuthorAvatar } from './contributor-avatars';
import { SummaryTooSoonError } from './timeline-api';
import {
  EARLIER_STATE_LABEL,
  RETRY_SUMMARY_LABEL,
  retryInLabel,
  SELECTION_SUMMARY_HEADING,
  SUMMARIZING_EDITS_MESSAGE,
} from './timeline-copy';

type SelectionSummaryCardProps = {
  view: SelectionSummaryView | undefined;
  error: Error | null;
  canRequest: boolean;
  isPending: boolean;
  onRetry: () => void;
};

function errorMessage(error: Error): string {
  if (error instanceof SummaryTooSoonError) return `${error.message} ${retryInLabel(secondsRoundedUp(error.retryAfterMs))}`;
  return error.message;
}

function useRevealRun({
  isRunning,
  summaryKey,
  targetRef,
}: {
  isRunning: boolean;
  summaryKey: string | undefined;
  targetRef: RefObject<HTMLElement | null>;
}): void {
  const wasRunning = useRef(isRunning);
  useEffect(() => {
    const hasStarted = isRunning && !wasRunning.current;
    const hasLanded = !isRunning && wasRunning.current && summaryKey !== undefined;
    wasRunning.current = isRunning;
    if (!hasStarted && !hasLanded) return;
    targetRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isRunning, summaryKey, targetRef]);
}

function SummarySection({ view, error, canRequest, isPending, onRetry }: SelectionSummaryCardProps & { view: SelectionSummaryView }) {
  const headingId = useId();
  const { summary } = view;
  const isRunning = view.state === SelectionSummaryState.Running;
  const isRetryableFailure = view.state === SelectionSummaryState.Failed && view.isModelAvailable;
  const hasContent = summary !== null || isRunning || isRetryableFailure || error !== null;
  const sectionRef = useRef<HTMLElement>(null);
  useRevealRun({ isRunning, summaryKey: summary?.key, targetRef: sectionRef });
  if (!hasContent) return null;
  return (
    <section ref={sectionRef} aria-labelledby={headingId} className="flex flex-col gap-2 rounded-md border p-3">
      <h3 id={headingId} className="text-sm font-medium">
        {SELECTION_SUMMARY_HEADING}
      </h3>
      {isRunning && (
        <p role="status" className="text-sm text-muted-foreground">
          {SUMMARIZING_EDITS_MESSAGE}
        </p>
      )}
      {summary && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <ul className="flex items-center gap-1">
              {summary.authors.map((name, index) => (
                <AuthorAvatar key={`${index}-${name}`} name={name} />
              ))}
            </ul>
            {summary.isStale && <Badge variant="secondary">{EARLIER_STATE_LABEL}</Badge>}
          </div>
          <p className="text-sm">{summary.sentence}</p>
        </div>
      )}
      {isRetryableFailure && (
        <p role="status" className="text-sm text-muted-foreground">
          {view.failure}
        </p>
      )}
      {isRetryableFailure && canRequest && (
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={isPending} onClick={onRetry}>
          {RETRY_SUMMARY_LABEL}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      )}
    </section>
  );
}

export function SelectionSummaryCard(props: SelectionSummaryCardProps) {
  const { view } = props;
  return <div aria-live="polite">{view !== undefined && <SummarySection {...props} view={view} />}</div>;
}
