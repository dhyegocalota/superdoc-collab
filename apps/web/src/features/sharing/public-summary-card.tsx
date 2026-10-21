import { SelectionSummaryState, SummarizeStep, type LatestSummary, type SelectionSummaryView } from '@superdoc-collab/types';
import { browserTimeZone } from '@/lib/browser-time-zone';
import { formatTimestamp } from '@/lib/format-date-time';
import { SelectionSummaryCard } from '@/features/timeline/selection-summary-card';
import type { SummarizeControl } from '@/features/timeline/use-summarize';
import { publicSummaryCaption } from './public-copy';

const LATEST_SUMMARY_KEY = 'latest';

const READ_ONLY_SUMMARIZE: SummarizeControl = {
  summarize: () => undefined,
  showSelection: () => undefined,
  isRunning: false,
  outcome: null,
  error: null,
  retryAfterSeconds: null,
};

function viewOf(latest: LatestSummary): SelectionSummaryView {
  return {
    state: SelectionSummaryState.Ready,
    summary: {
      key: LATEST_SUMMARY_KEY,
      sentence: latest.sentence,
      authors: latest.authors,
      computedAtSequence: latest.computedAtSequence,
      isStale: false,
    },
    failure: null,
    isModelAvailable: false,
    step: SummarizeStep.Idle,
    partial: null,
  };
}

export function PublicSummaryCard({ latest }: { latest: LatestSummary }) {
  return (
    <div className="flex flex-col gap-1 border-b px-3 py-2">
      <SelectionSummaryCard view={viewOf(latest)} summarize={READ_ONLY_SUMMARIZE} canRequest={false} authors={{}} />
      <p className="text-xs text-muted-foreground">
        {publicSummaryCaption(formatTimestamp({ time: latest.updatedAt, timeZone: browserTimeZone() }))}
      </p>
    </div>
  );
}
