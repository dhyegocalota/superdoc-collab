import type { DocumentTimeline } from '@superdoc-history/types';

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const RANGE_SEPARATOR = ' – ';

class MissingAuthorError extends Error {}

export function formatTimestamp(time: number): string {
  return TIMESTAMP_FORMAT.format(time);
}

export function formatBinRange({ start, binMs }: { start: number; binMs: number }): string {
  return `${formatTimestamp(start)}${RANGE_SEPARATOR}${formatTimestamp(start + binMs)}`;
}

function authorName({ timeline, authorKey }: { timeline: DocumentTimeline; authorKey: string }): string {
  const author = timeline.authors[authorKey];
  if (!author) throw new MissingAuthorError(authorKey);
  return author.name;
}

export function TimelineTooltip({ timeline, index, left }: { timeline: DocumentTimeline; index: number; left: number }) {
  const bin = timeline.bins[index]!;
  const rows = timeline.bands
    .map((band) => ({ band, cell: bin.byBand[band.id] }))
    .filter(({ cell }) => cell !== undefined && cell.inserted + cell.deleted > 0);
  return (
    <div role="tooltip" style={{ left }} className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{formatBinRange({ start: bin.start, binMs: timeline.binMs })}</p>
      {rows.map(({ band, cell }) => (
        <p key={band.id}>
          {band.name} +{cell!.inserted} −{cell!.deleted} · {cell!.authorKeys.map((authorKey) => authorName({ timeline, authorKey })).join(', ')}
        </p>
      ))}
    </div>
  );
}
