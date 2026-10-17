import type { DocumentTimeline } from '@superdoc-history/types';
import { cn } from '@/lib/utils';
import { authorOf } from './author-of';

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const TOOLTIP_WIDTH = 256;
export const TOOLTIP_POINTER_OFFSET = 12;
const RANGE_SEPARATOR = ' – ';
const TOOLTIP_EDGE_FRACTION = 1 / 3;

export enum TooltipAlignment {
  Start = 'start',
  Center = 'center',
  End = 'end',
}

const ALIGNMENT_CLASS: Record<TooltipAlignment, string> = {
  [TooltipAlignment.Start]: 'translate-x-0',
  [TooltipAlignment.Center]: '-translate-x-1/2',
  [TooltipAlignment.End]: '-translate-x-full',
};

export function tooltipAlignment({ left, chartWidth }: { left: number; chartWidth: number }): TooltipAlignment {
  if (left < chartWidth * TOOLTIP_EDGE_FRACTION) return TooltipAlignment.Start;
  if (left > chartWidth * (1 - TOOLTIP_EDGE_FRACTION)) return TooltipAlignment.End;
  return TooltipAlignment.Center;
}

const ALIGNMENT_WIDTH_FRACTION: Record<TooltipAlignment, number> = {
  [TooltipAlignment.Start]: 0,
  [TooltipAlignment.Center]: 0.5,
  [TooltipAlignment.End]: 1,
};

function tooltipWidthIn(chartWidth: number): number {
  return Math.min(TOOLTIP_WIDTH, chartWidth);
}

export function tooltipAnchorLeft({ left, chartWidth }: { left: number; chartWidth: number }): number {
  const tooltipWidth = tooltipWidthIn(chartWidth);
  const reach = tooltipWidth * ALIGNMENT_WIDTH_FRACTION[tooltipAlignment({ left, chartWidth })];
  return Math.min(Math.max(left, reach), chartWidth - tooltipWidth + reach);
}

export function formatTimestamp(time: number): string {
  return TIMESTAMP_FORMAT.format(time);
}

export function formatBinRange({ start, binMs }: { start: number; binMs: number }): string {
  return `${formatTimestamp(start)}${RANGE_SEPARATOR}${formatTimestamp(start + binMs)}`;
}

export function TimelineTooltip({
  id,
  timeline,
  index,
  left,
  top,
  chartWidth,
}: {
  id: string;
  timeline: DocumentTimeline;
  index: number;
  left: number;
  top: number;
  chartWidth: number;
}) {
  const bin = timeline.bins[index]!;
  const rows = timeline.bands
    .map((band) => ({ band, cell: bin.byBand[band.id] }))
    .filter(({ cell }) => cell !== undefined && cell.inserted + cell.deleted > 0);
  const alignment = tooltipAlignment({ left, chartWidth });
  return (
    <div
      id={id}
      role="tooltip"
      data-alignment={alignment}
      style={{ left: tooltipAnchorLeft({ left, chartWidth }), top, width: tooltipWidthIn(chartWidth) }}
      className={cn(
        'pointer-events-none absolute z-10 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md',
        ALIGNMENT_CLASS[alignment],
      )}
    >
      <p className="font-medium">{formatBinRange({ start: bin.start, binMs: timeline.binMs })}</p>
      {rows.map(({ band, cell }) => (
        <p key={band.id}>
          {band.name} +{cell!.inserted} −{cell!.deleted} ·{' '}
          {cell!.authorKeys.map((authorKey) => authorOf({ authors: timeline.authors, authorKey }).name).join(', ')}
        </p>
      ))}
    </div>
  );
}
