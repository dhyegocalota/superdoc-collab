import { SelectionSummaryState, type SelectionSummaryView } from '@superdoc-history/types';
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

const RUNNING_REVEAL_KEY = 'running';

type SelectionSummaryCardProps = {
  view: SelectionSummaryView | undefined;
  error: Error | null;
  canRequest: boolean;
  isPending: boolean;
  onRetry: () => void;
};

function errorMessage(error: Error): string {
  if (error instanceof SummaryTooSoonError) return `${error.message} ${retryInLabel(error.retryAfterSeconds)}`;
  return error.message;
}

function useRevealOnChange({ revealKey, targetRef }: { revealKey: string | undefined; targetRef: RefObject<HTMLElement | null> }): void {
  const lastRevealKey = useRef(revealKey);
  useEffect(() => {
    if (lastRevealKey.current === revealKey) return;
    lastRevealKey.current = revealKey;
    targetRef.current?.scrollIntoView({ block: 'nearest' });
  }, [revealKey, targetRef]);
}

function SummarySection({ view, error, canRequest, isPending, onRetry }: SelectionSummaryCardProps & { view: SelectionSummaryView }) {
  const headingId = useId();
  const { summary } = view;
  const isRunning = view.state === SelectionSummaryState.Running;
  const isRetryableFailure = view.state === SelectionSummaryState.Failed && view.isModelAvailable;
  const hasContent = summary !== null || isRunning || isRetryableFailure || error !== null;
  const sectionRef = useRef<HTMLElement>(null);
  useRevealOnChange({ revealKey: isRunning ? RUNNING_REVEAL_KEY : summary?.key, targetRef: sectionRef });
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
