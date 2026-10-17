import { SelectionSummaryState, type SelectionSummaryView } from '@superdoc-history/types';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { AuthorAvatar } from './contributor-avatars';
import { SummaryTooSoonError } from './timeline-api';
import { EARLIER_STATE_LABEL, RETRY_SUMMARY_LABEL, retryInLabel, SELECTION_SUMMARY_HEADING, SUMMARIZING_EDITS_MESSAGE } from './timeline-copy';

type SelectionSummaryCardProps = { view: SelectionSummaryView | undefined; error: Error | null; canRequest: boolean; onRetry: () => void };

function errorMessage(error: Error): string {
  if (error instanceof SummaryTooSoonError) return `${error.message} ${retryInLabel(error.retryAfterSeconds)}`;
  return error.message;
}

export function SelectionSummaryCard({ view, error, canRequest, onRetry }: SelectionSummaryCardProps) {
  const headingId = useId();
  if (view === undefined) return null;
  const { summary } = view;
  const isRunning = view.state === SelectionSummaryState.Running;
  const isRetryableFailure = view.state === SelectionSummaryState.Failed && view.isModelAvailable;
  const hasContent = summary !== null || isRunning || isRetryableFailure || error !== null;
  if (!hasContent) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-medium">
        {SELECTION_SUMMARY_HEADING}
      </h3>
      {isRunning && <p role="status" className="text-sm text-muted-foreground">{SUMMARIZING_EDITS_MESSAGE}</p>}
      {summary && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <ul className="flex items-center gap-1">
              {summary.authors.map((name) => <AuthorAvatar key={name} name={name} />)}
            </ul>
            {summary.isStale && <span className="rounded-md border px-1.5 text-xs text-muted-foreground">{EARLIER_STATE_LABEL}</span>}
          </div>
          <p className="text-sm">{summary.sentence}</p>
        </div>
      )}
      {isRetryableFailure && <p role="status" className="text-sm text-muted-foreground">{view.failure}</p>}
      {isRetryableFailure && canRequest && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onRetry}>
          {RETRY_SUMMARY_LABEL}
        </Button>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{errorMessage(error)}</p>}
    </section>
  );
}
