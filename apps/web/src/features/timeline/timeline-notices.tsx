import {
  HISTORY_CATCHING_UP_MESSAGE,
  NO_MATCHING_EDITS_MESSAGE,
  SECOND_MS,
  TOPICS_PENDING_MESSAGE,
  TOPICS_UNAVAILABLE_MESSAGE,
  TopicState,
  type DocumentTimeline,
} from '@superdoc-collab/types';
import { Button } from '@/components/ui/button';
import { lagBehindLabel, NO_EDITS_YET_MESSAGE, RETRY_TOPICS_LABEL } from './timeline-copy';

export const PROJECTION_LAG_NOTICE_MS = 10 * SECOND_MS;

type TimelineNoticesProps = { timeline: DocumentTimeline; hasFilter: boolean; canRefresh: boolean; onRetry: () => void };

export function TimelineNotices({ timeline, hasFilter, canRefresh, onRetry }: TimelineNoticesProps) {
  const { topics, projection, bins, bands } = timeline;
  const isLagging = projection.isBehind && projection.lagMs !== null && projection.lagMs >= PROJECTION_LAG_NOTICE_MS;
  const hasNoMatches = hasFilter && bins.length > 0 && bands.every((band) => band.volume === 0);
  const isEmpty = bins.length === 0 && !projection.isBehind;
  const isNamingTopics = topics.state === TopicState.Pending && bins.length > 0;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {topics.state === TopicState.Failed && (
        <div role="status" className="flex flex-col gap-1">
          <p>{TOPICS_UNAVAILABLE_MESSAGE}</p>
          {topics.failure && <p className="text-muted-foreground">{topics.failure}</p>}
          {canRefresh && (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={onRetry}>
              {RETRY_TOPICS_LABEL}
            </Button>
          )}
        </div>
      )}
      {isNamingTopics && <p role="status">{TOPICS_PENDING_MESSAGE}</p>}
      {isLagging && (
        <div role="status" className="flex items-center gap-2">
          <p>{HISTORY_CATCHING_UP_MESSAGE}</p>
          <p className="text-muted-foreground">{lagBehindLabel(Math.round(projection.lagMs! / SECOND_MS))}</p>
        </div>
      )}
      {isEmpty && <p role="status">{NO_EDITS_YET_MESSAGE}</p>}
      {hasNoMatches && <p role="status">{NO_MATCHING_EDITS_MESSAGE}</p>}
    </div>
  );
}
