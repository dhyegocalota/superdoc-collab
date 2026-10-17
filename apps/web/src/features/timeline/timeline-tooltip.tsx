import type { DocumentTimeline } from '@superdoc-history/types';
import { authorOf } from './author-of';

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const TOOLTIP_WIDTH = 256;
export const TOOLTIP_POINTER_OFFSET = 12;
const RANGE_SEPARATOR = ' – ';

export function formatTimestamp(time: number): string {
  return TIMESTAMP_FORMAT.format(time);
}

export function formatBinRange({ start, binMs }: { start: number; binMs: number }): string {
  return `${formatTimestamp(start)}${RANGE_SEPARATOR}${formatTimestamp(start + binMs)}`;
}

export function TimelineTooltip({ timeline, index, left, top }: { timeline: DocumentTimeline; index: number; left: number; top: number }) {
  const bin = timeline.bins[index]!;
  const rows = timeline.bands
    .map((band) => ({ band, cell: bin.byBand[band.id] }))
    .filter(({ cell }) => cell !== undefined && cell.inserted + cell.deleted > 0);
  return (
    <div role="tooltip" style={{ left, top, width: TOOLTIP_WIDTH }} className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{formatBinRange({ start: bin.start, binMs: timeline.binMs })}</p>
      {rows.map(({ band, cell }) => (
        <p key={band.id}>
          {band.name} +{cell!.inserted} −{cell!.deleted} · {cell!.authorKeys.map((authorKey) => authorOf({ authors: timeline.authors, authorKey }).name).join(', ')}
        </p>
      ))}
    </div>
  );
}
