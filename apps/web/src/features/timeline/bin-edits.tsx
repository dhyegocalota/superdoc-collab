import type { DocumentTimeline, EditRunView, TimelineBin, TimelineFilter } from '@superdoc-history/types';
import { useQuery } from '@tanstack/react-query';
import { formatBinRange } from '@/lib/format-date-time';
import { authorOf } from './author-of';
import { binEditsQueryKey, fetchBinEdits, pollWhileAvailable } from './timeline-api';
import { NO_EDITS_IN_BIN_MESSAGE } from './timeline-copy';
import { TopicChip } from './topic-chip';

export const SNIPPET_MAX_CHARACTERS = 120;
const ELLIPSIS = '…';

class MissingBandError extends Error {}

function snippetOf(text: string): string {
  if (text.length <= SNIPPET_MAX_CHARACTERS) return text;
  return `${text.slice(0, SNIPPET_MAX_CHARACTERS)}${ELLIPSIS}`;
}

type BinEditsProps = { documentId: string; timeline: DocumentTimeline; bin: TimelineBin; filter: TimelineFilter };

export function BinEdits({ documentId, timeline, bin, filter }: BinEditsProps) {
  const { data } = useQuery({
    queryKey: binEditsQueryKey({ documentId, binStart: bin.start, binMs: timeline.binMs, filter }),
    queryFn: () => fetchBinEdits({ documentId, binStart: bin.start, binMs: timeline.binMs, filter }),
    refetchInterval: pollWhileAvailable,
    retry: false,
  });
  const maxVolume = Math.max(0, ...timeline.bands.map((band) => band.volume));

  function renderRun(run: EditRunView) {
    const band = timeline.bands.find((candidate) => candidate.id === run.bandId);
    if (!band) throw new MissingBandError(run.bandId);
    return (
      <li key={`${run.blockId}-${run.bandId}`} className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <TopicChip band={band} maxVolume={maxVolume} />
          <p className="text-xs text-muted-foreground">
            {run.authorKeys.map((authorKey) => authorOf({ authors: data!.authors, authorKey }).name).join(', ')}
          </p>
        </div>
        {run.inserted && <p className="text-sm text-primary">{`+"${snippetOf(run.inserted)}"`}</p>}
        {run.deleted && <p className="text-sm text-destructive">{`−"${snippetOf(run.deleted)}"`}</p>}
      </li>
    );
  }

  if (!data) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{formatBinRange({ start: bin.start, binMs: timeline.binMs })}</h3>
      {data.runs.length === 0 && <p role="status">{NO_EDITS_IN_BIN_MESSAGE}</p>}
      <ul className="flex flex-col gap-3">{data.runs.map(renderRun)}</ul>
    </section>
  );
}
