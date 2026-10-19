import {
  SECOND_MS,
  SelectionSummaryState,
  SummarizeOutcome,
  SummarizeStep,
  type EventAuthor,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import { Check, Loader2Icon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, type RefObject } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCountdown } from '@/lib/use-countdown';
import { authorByName } from './author-of';
import { AuthorAvatar } from './contributor-avatars';
import {
  EARLIER_STATE_LABEL,
  GROUPING_TOPICS_MESSAGE,
  NEXT_SUMMARIZING_LABEL,
  NO_EDITS_TO_SUMMARIZE_MESSAGE,
  RETRY_SUMMARY_LABEL,
  retryInLabel,
  SELECTION_SUMMARY_HEADING,
  SUMMARIZING_EDITS_MESSAGE,
  SUMMARY_UP_TO_DATE_MESSAGE,
  TOPICS_GROUPED_LABEL,
} from './timeline-copy';
import type { SummarizeControl } from './use-summarize';
import { useWordReveal } from './use-word-reveal';

type SelectionSummaryCardProps = {
  view: SelectionSummaryView | undefined;
  summarize: SummarizeControl;
  canRequest: boolean;
  authors: Record<string, EventAuthor>;
};

function errorMessage({ error, secondsLeft }: { error: Error; secondsLeft: number | null }): string {
  if (secondsLeft === null) return error.message;
  return `${error.message} ${retryInLabel(secondsLeft)}`;
}

function hasPartialWord(partial: string | null): partial is string {
  return partial !== null && partial.trim() !== '';
}

function displayedSentence({ partial, summary }: SelectionSummaryView): string | null {
  if (hasPartialWord(partial)) return partial;
  if (summary !== null) return summary.sentence;
  return null;
}

function Sentence({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const revealed = useWordReveal({ text, isStreaming });
  return <p className="text-sm">{revealed}</p>;
}

function Spinner() {
  return <Loader2Icon aria-hidden className="size-4 shrink-0 animate-spin" />;
}

function GroupingProgress() {
  return (
    <div role="status" className="flex flex-col gap-1 text-sm">
      <p className="flex items-center gap-2">
        <Spinner />
        {GROUPING_TOPICS_MESSAGE}
      </p>
      <p className="text-muted-foreground">{NEXT_SUMMARIZING_LABEL}</p>
    </div>
  );
}

function SummarizingProgress() {
  return (
    <div role="status" className="flex flex-col gap-1 text-sm">
      <p className="flex items-center gap-2">
        <Check aria-hidden className="size-4 shrink-0" />
        {TOPICS_GROUPED_LABEL}
      </p>
      <p className="flex items-center gap-2">
        <Spinner />
        {SUMMARIZING_EDITS_MESSAGE}
      </p>
    </div>
  );
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

function SummarySection({ view, summarize, canRequest, authors }: SelectionSummaryCardProps & { view: SelectionSummaryView }) {
  const headingId = useId();
  const { summary } = view;
  const { error, retryAfterSeconds } = summarize;
  const deadlineMs = useMemo(() => (retryAfterSeconds === null ? null : Date.now() + retryAfterSeconds * SECOND_MS), [error]);
  const secondsLeft = useCountdown(deadlineMs);
  const isGrouping = view.step === SummarizeStep.Grouping;
  const isSummarizing = view.step === SummarizeStep.Summarizing;
  const isRunning = summarize.isRunning || view.state === SelectionSummaryState.Running || isGrouping || isSummarizing;
  const isStreamingSentence = hasPartialWord(view.partial);
  const sentence = displayedSentence(view);
  const isRunningWithoutStep = isRunning && !isGrouping && !isSummarizing;
  const isAnsweredUpToDate = summarize.outcome === SummarizeOutcome.UpToDate;
  const isEmpty = isAnsweredUpToDate && summary === null;
  const isUpToDate = isAnsweredUpToDate && summary !== null && !summary.isStale;
  const isRetryableFailure = view.state === SelectionSummaryState.Failed && view.isModelAvailable;
  const isRetryableError = error !== null && retryAfterSeconds === null;
  const showsRetry = canRequest && (isRetryableFailure || isRetryableError);
  const hasContent = summary !== null || isRunning || isRetryableFailure || error !== null || isAnsweredUpToDate;
  const sectionRef = useRef<HTMLElement>(null);
  useRevealRun({ isRunning, summaryKey: summary?.key, targetRef: sectionRef });
  if (!hasContent) return null;
  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      aria-busy={isStreamingSentence}
      className="flex flex-col gap-2 rounded-md border p-3"
    >
      <h3 id={headingId} className="text-sm font-medium">
        {SELECTION_SUMMARY_HEADING}
      </h3>
      {isGrouping && !isStreamingSentence && <GroupingProgress />}
      {isSummarizing && !isStreamingSentence && <SummarizingProgress />}
      {isRunningWithoutStep && !isStreamingSentence && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {SUMMARIZING_EDITS_MESSAGE}
        </p>
      )}
      {sentence !== null && (
        <div className="flex flex-col gap-1">
          {summary && !isStreamingSentence && (
            <div className="flex items-center justify-between gap-2">
              <ul className="flex items-center gap-1">
                {summary.authors.map((author, index) => {
                  const known = authorByName({ authors, name: author.name, actor: author.actor });
                  const avatarAuthor = known ? known : { id: null, name: author.name, actor: author.actor };
                  return <AuthorAvatar key={`${index}-${author.name}`} author={avatarAuthor} />;
                })}
              </ul>
              {summary.isStale && <Badge variant="secondary">{EARLIER_STATE_LABEL}</Badge>}
            </div>
          )}
          <Sentence text={sentence} isStreaming={isStreamingSentence} />
        </div>
      )}
      {isEmpty && (
        <p role="status" className="text-sm text-muted-foreground">
          {NO_EDITS_TO_SUMMARIZE_MESSAGE}
        </p>
      )}
      {isUpToDate && (
        <p role="status" className="text-sm text-muted-foreground">
          {SUMMARY_UP_TO_DATE_MESSAGE}
        </p>
      )}
      {isRetryableFailure && (
        <p role="status" className="text-sm text-muted-foreground">
          {view.failure}
        </p>
      )}
      {error && <ErrorMessage>{errorMessage({ error, secondsLeft })}</ErrorMessage>}
      {showsRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={summarize.isRunning}
          onClick={summarize.summarize}
        >
          {RETRY_SUMMARY_LABEL}
        </Button>
      )}
    </section>
  );
}

export function SelectionSummaryCard(props: SelectionSummaryCardProps) {
  const { view } = props;
  return <div aria-live="polite">{view !== undefined && <SummarySection {...props} view={view} />}</div>;
}
