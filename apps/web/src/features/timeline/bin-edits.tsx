import {
  IMPORTED_KEY_PREFIX,
  TimelineSearchParam,
  type BinEditRun,
  type DocumentTimeline,
  type TimelineBin,
  type TimelineFilter,
} from '@superdoc-collab/types';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { pollWhileAvailable } from '@/lib/api';
import { formatBinRange } from '@/lib/format-date-time';
import { AuthorNames } from './author-names';
import { maxBandVolume } from './max-band-volume';
import { binEditsQueryKey, fetchBinEdits, TIMELINE_POLL_MS } from './timeline-api';
import { NO_EDITS_IN_BIN_MESSAGE, VIEW_EDIT_VERSION_LABEL } from './timeline-copy';
import { TopicChip } from './topic-chip';
import { useTimelineSearch } from './use-timeline-search';

export const SNIPPET_MAX_CHARACTERS = 120;
const ELLIPSIS = '…';

class MissingBandError extends Error {}

function snippetOf(text: string): string {
  if (text.length <= SNIPPET_MAX_CHARACTERS) return text;
  return `${text.slice(0, SNIPPET_MAX_CHARACTERS)}${ELLIPSIS}`;
}

type BinEditsProps = { documentId: string; timeline: DocumentTimeline; bin: TimelineBin; filter: TimelineFilter };

export function BinEdits({ documentId, timeline, bin, filter }: BinEditsProps) {
  const { timeZone } = timeline;
  const { data } = useQuery({
    queryKey: binEditsQueryKey({ documentId, binStart: bin.start, binMs: timeline.binMs, filter, timeZone }),
    queryFn: () => fetchBinEdits({ documentId, binStart: bin.start, binMs: timeline.binMs, filter, timeZone }),
    refetchInterval: pollWhileAvailable(TIMELINE_POLL_MS),
    retry: false,
  });
  const maxVolume = maxBandVolume(timeline);
  const { search, update } = useTimelineSearch();

  function viewVersionAfter(run: BinEditRun): void {
    update({
      changes: { [TimelineSearchParam.At]: String(bin.start), [TimelineSearchParam.Sequence]: String(run.versionSequence) },
      replace: search.at !== null,
    });
  }

  function renderRun(run: BinEditRun) {
    const isImported = run.authorKeys.every((key) => key.startsWith(IMPORTED_KEY_PREFIX));
    const band = timeline.bands.find((candidate) => candidate.id === run.bandId);
    if (!band) throw new MissingBandError(run.bandId);
    const inserted = run.inserted.trim();
    const deleted = run.deleted.trim();
    return (
      <li key={`${run.blockId}-${run.bandId}`} className="flex flex-col items-start gap-1">
        <div className="flex w-full items-center justify-between gap-2">
          <TopicChip band={band} maxVolume={maxVolume} />
          <p className="text-xs text-muted-foreground">
            <AuthorNames authors={data!.authors} authorKeys={run.authorKeys} />
          </p>
        </div>
        {inserted && <ins className="rounded-sm bg-inserted px-1 text-sm no-underline">{snippetOf(inserted)}</ins>}
        {deleted && <del className="rounded-sm bg-deleted px-1 text-sm">{snippetOf(deleted)}</del>}
        {!isImported && (
          <Button type="button" variant="outline" size="xs" onClick={() => viewVersionAfter(run)}>
            {VIEW_EDIT_VERSION_LABEL}
          </Button>
        )}
      </li>
    );
  }

  if (!data) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{formatBinRange({ start: bin.start, end: bin.end, binMs: timeline.binMs, timeZone })}</h3>
      {data.runs.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {NO_EDITS_IN_BIN_MESSAGE}
        </p>
      )}
      <ul className="flex flex-col gap-3">{data.runs.map(renderRun)}</ul>
    </section>
  );
}
