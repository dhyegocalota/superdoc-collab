import { IMPORTED_KEY_PREFIX, SelectionSummaryState, type DocumentTimeline, type EditSelection } from '@superdoc-collab/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTimeZone } from '@/lib/use-time-zone';
import { fetchSelectionSummary, selectionSummaryQueryKey } from './timeline-api';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';

const WHOLE_DOCUMENT: EditSelection = { term: null, author: null, topic: null, at: null };

export function hasImportedHistory(timeline: DocumentTimeline): boolean {
  return Object.keys(timeline.authors).some((key) => key.startsWith(IMPORTED_KEY_PREFIX));
}

export function useImportedHistorySummary({
  documentId,
  canRequest,
  isEditorReady,
  onStart,
}: {
  documentId: string;
  canRequest: boolean;
  isEditorReady: boolean;
  onStart: () => void;
}): void {
  const { search } = useTimelineSearch();
  const { timeZone: preferredTimeZone } = useTimeZone();
  const [hasDecided, setHasDecided] = useState(false);
  const isWholeDocument = search.filter.term === null && search.filter.author === null && search.topic === null && search.at === null;
  const isWatching = canRequest && isEditorReady && isWholeDocument && !hasDecided;
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen: isWatching });
  const isImported = timeline !== undefined && hasImportedHistory(timeline);
  const binMs = timeline ? timeline.binMs : null;
  const timeZone = timeline ? timeline.timeZone : preferredTimeZone;
  const { data: view } = useQuery({
    queryKey: selectionSummaryQueryKey({ documentId, selection: WHOLE_DOCUMENT, timeZone }),
    queryFn: () => fetchSelectionSummary({ documentId, selection: WHOLE_DOCUMENT, binMs, timeZone }),
    enabled: isWatching && isImported,
    retry: false,
  });

  useEffect(() => {
    if (!isWatching || timeline === undefined) return;
    if (timeline.projection.isImporting) return;
    if (!isImported) return setHasDecided(true);
    if (view === undefined) return;
    setHasDecided(true);
    if (view.state === SelectionSummaryState.None) onStart();
  }, [isWatching, timeline, isImported, view]);
}
