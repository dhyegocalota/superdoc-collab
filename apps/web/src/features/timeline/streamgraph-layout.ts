import { cellVolume, toStackRows, type StackRow } from '@superdoc-collab/history/timeline';
import { MINUTE_MS, type DocumentTimeline, type TimelineBand, type TimelineCell } from '@superdoc-collab/types';
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import { area, curveBasis, stack, stackOffsetWiggle, stackOrderInsideOut, type Series } from 'd3-shape';
import { idleBreaksOf, type IdleBreak } from './idle-breaks';
import { maxBandVolume } from './max-band-volume';

export const CHART_HEIGHT = 240;
export const IDLE_BREAK_MS = 5 * MINUTE_MS;
export const BREAK_WIDTH_PX = 16;
export const MIN_LABEL_HEIGHT = 16;
export const SATURATION_MIN = 35;
export const SATURATION_MAX = 85;
const CHART_PADDING = 8;
const LABEL_CHARACTER_WIDTH = 7;
const HALF = 2;

type StackSeries = Series<StackRow, string>;
type LabelBox = { left: number; right: number; top: number; bottom: number };
export type BandShape = {
  band: TimelineBand;
  path: string;
  saturation: number;
  label: { x: number; y: number } | null;
  agentPath: string | null;
};
type Segment = { first: number; last: number };
type Slot = { index: number; x: number };
type AreaPoint = { x: number; lower: number; upper: number };
type BinColumns = { binXs: number[]; slots: Slot[]; breaks: BreakColumn[] };
type PlacedLabel = { label: { x: number; y: number }; box: LabelBox };
export type BreakColumn = IdleBreak & { left: number; right: number; centerX: number };
export type StreamgraphLayout = {
  shapes: BandShape[];
  breaks: BreakColumn[];
  binX: (index: number) => number;
  breakAt: (position: number) => BreakColumn | null;
  binAt: (position: number) => number;
  timeX: (time: number) => number;
};

class MissingStackValueError extends Error {}
class MissingBandError extends Error {}
class EmptyBandPathError extends Error {}
class NoBinsError extends Error {}
class UnknownBinError extends Error {}

function firstBinStart(timeline: DocumentTimeline): number {
  const [firstBin] = timeline.bins;
  if (!firstBin) throw new NoBinsError();
  return firstBin.start;
}

function agentFractionOf(cell: TimelineCell | undefined): number {
  const volume = cellVolume(cell);
  if (!cell || volume === 0) return 0;
  return (cell.agentInserted + cell.agentDeleted) / volume;
}

export function saturationOf({ volume, maxVolume }: { volume: number; maxVolume: number }): number {
  if (maxVolume === 0) return SATURATION_MIN;
  return Math.round(SATURATION_MIN + ((SATURATION_MAX - SATURATION_MIN) * volume) / maxVolume);
}

function cellValue({ row, key }: { row: StackRow; key: string }): number {
  const value = row.values[key];
  if (value === undefined) throw new MissingStackValueError(key);
  return value;
}

function bandOf({ timeline, id }: { timeline: DocumentTimeline; id: string }): TimelineBand {
  const band = timeline.bands.find((candidate) => candidate.id === id);
  if (!band) throw new MissingBandError(id);
  return band;
}

function intersects({ first, second }: { first: LabelBox; second: LabelBox }): boolean {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

function containsIndex({ range, index }: { range: { first: number; last: number }; index: number }): boolean {
  return index >= range.first && index <= range.last;
}

function taperPoint({ x, point }: { x: number; point: AreaPoint }): AreaPoint {
  const middle = (point.lower + point.upper) / HALF;
  return { x, lower: middle, upper: middle };
}

function segmentsOf({ binCount, breaks }: { binCount: number; breaks: IdleBreak[] }): Segment[] {
  const firsts = [0, ...breaks.map((idleBreak) => idleBreak.lastIndex + 1)];
  const lasts = [...breaks.map((idleBreak) => idleBreak.firstIndex - 1), binCount - 1];
  return firsts.map((first, order) => ({ first, last: lasts[order]! }));
}

function binColumnsOf({ binCount, idleBreaks, width }: { binCount: number; idleBreaks: IdleBreak[]; width: number }): BinColumns {
  const visibleBins = Array.from({ length: binCount }, (_, index) => index).filter(
    (index) => !idleBreaks.some((idleBreak) => containsIndex({ range: { first: idleBreak.firstIndex, last: idleBreak.lastIndex }, index })),
  );
  const intervalCount = visibleBins.length - 1;
  const pitchIntervalCount = intervalCount - idleBreaks.length;
  const breakWidth = pitchIntervalCount > 0 ? Math.min(BREAK_WIDTH_PX, width / intervalCount) : width / Math.max(1, idleBreaks.length);
  const pitchedWidth = width - idleBreaks.length * breakWidth;
  const slots = visibleBins.map((index, order) => {
    const breaksBefore = idleBreaks.filter((idleBreak) => idleBreak.lastIndex < index).length;
    const pitchSteps = order - breaksBefore;
    return { index, x: breaksBefore * breakWidth + pitchedWidth * (pitchSteps / Math.max(1, pitchIntervalCount)) };
  });
  const slotX = new Map(slots.map((slot) => [slot.index, slot.x]));
  const breaks = idleBreaks.map((idleBreak) => {
    const left = slotX.get(idleBreak.firstIndex - 1)!;
    const right = slotX.get(idleBreak.lastIndex + 1)!;
    return { ...idleBreak, left, right, centerX: (left + right) / HALF };
  });
  const binXs = Array.from({ length: binCount }, (_, index) => {
    const column = breaks.find((candidate) => containsIndex({ range: { first: candidate.firstIndex, last: candidate.lastIndex }, index }));
    if (column) return column.centerX;
    return slotX.get(index)!;
  });
  return { binXs, slots, breaks };
}

function labelBoxOf({
  band,
  points,
  binX,
  segments,
  y,
  placed,
}: {
  band: TimelineBand;
  points: StackSeries;
  binX: (index: number) => number;
  segments: Segment[];
  y: ScaleLinear<number, number>;
  placed: LabelBox[];
}): PlacedLabel | null {
  const thickness = points.map((point) => y(point[0]) - y(point[1]));
  const halfWidth = (band.name.length * LABEL_CHARACTER_WIDTH) / HALF;

  function fitsAt(index: number): boolean {
    const segment = segments.find((candidate) => containsIndex({ range: candidate, index }));
    if (!segment) return false;
    const left = binX(index) - halfWidth;
    const right = binX(index) + halfWidth;
    const isInsideSegment = left >= binX(segment.first) && right <= binX(segment.last);
    if (!isInsideSegment) return false;
    const segmentBins = Array.from({ length: segment.last - segment.first + 1 }, (_, offset) => segment.first + offset);
    const firstBin = segmentBins.filter((binIndex) => binX(binIndex) <= left).at(-1)!;
    const lastBin = segmentBins.find((binIndex) => binX(binIndex) >= right)!;
    return thickness.slice(firstBin, lastBin + 1).every((value) => value >= MIN_LABEL_HEIGHT);
  }

  const candidates = thickness.map((value, index) => ({ value, index })).filter(({ index }) => fitsAt(index));
  if (candidates.length === 0) return null;
  const { index } = candidates.reduce((best, candidate) => (candidate.value > best.value ? candidate : best));
  const centerX = binX(index);
  const centerY = (y(points[index]![0]) + y(points[index]![1])) / HALF;
  const box: LabelBox = {
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    top: centerY - MIN_LABEL_HEIGHT / HALF,
    bottom: centerY + MIN_LABEL_HEIGHT / HALF,
  };
  if (placed.some((other) => intersects({ first: box, second: other }))) return null;
  return { label: { x: centerX, y: centerY }, box };
}

export function layoutStreamgraph({ timeline, width }: { timeline: DocumentTimeline; width: number }): StreamgraphLayout {
  const bandIds = timeline.bands.map((band) => band.id);
  const series = stack<StackRow, string>()
    .keys(bandIds)
    .value((row, key) => cellValue({ row, key }))
    .order(stackOrderInsideOut)
    .offset(stackOffsetWiggle)(toStackRows({ bins: timeline.bins, bandIds }));
  const lastIndex = Math.max(0, timeline.bins.length - 1);
  const idleBreaks = idleBreaksOf({ timeline, thresholdMs: IDLE_BREAK_MS });
  const { binXs, slots, breaks } = binColumnsOf({ binCount: timeline.bins.length, idleBreaks, width });
  const segments = segmentsOf({ binCount: timeline.bins.length, breaks: idleBreaks });

  function binX(index: number): number {
    const position = binXs[index];
    if (position === undefined) throw new UnknownBinError(String(index));
    return position;
  }

  const lowest = Math.min(0, ...series.flatMap((points) => points.map((point) => point[0])));
  const highest = Math.max(lowest + 1, ...series.flatMap((points) => points.map((point) => point[1])));
  const y = scaleLinear()
    .domain([lowest, highest])
    .range([CHART_HEIGHT - CHART_PADDING, CHART_PADDING]);

  function segmentPointsOf({ segment, values }: { segment: Segment; values: [number, number][] }): AreaPoint[] {
    const points = values
      .slice(segment.first, segment.last + 1)
      .map(([lower, upper], offset) => ({ x: binX(segment.first + offset), lower, upper }));
    const leftBreak = breaks.find((column) => column.lastIndex + 1 === segment.first);
    const rightBreak = breaks.find((column) => column.firstIndex - 1 === segment.last);
    const leftTaper = leftBreak ? [taperPoint({ x: leftBreak.centerX, point: points[0]! })] : [];
    const rightTaper = rightBreak ? [taperPoint({ x: rightBreak.centerX, point: points.at(-1)! })] : [];
    return [...leftTaper, ...points, ...rightTaper];
  }

  function closedPathOf({ bandId, values }: { bandId: string; values: [number, number][] }): string {
    return segments
      .map((segment) => {
        const path = area<AreaPoint>()
          .x((point) => point.x)
          .y0((point) => y(point.lower))
          .y1((point) => y(point.upper))
          .curve(curveBasis)(segmentPointsOf({ segment, values }));
        if (!path) throw new EmptyBandPathError(bandId);
        return `${path}Z`;
      })
      .join('');
  }

  function agentPathOf({ band, points }: { band: TimelineBand; points: StackSeries }): string | null {
    const fractions = timeline.bins.map((bin) => agentFractionOf(bin.byBand[band.id]));
    if (fractions.every((fraction) => fraction === 0)) return null;
    return closedPathOf({
      bandId: band.id,
      values: points.map((point, index): [number, number] => [point[0], point[0] + (point[1] - point[0]) * fractions[index]!]),
    });
  }

  const maxVolume = maxBandVolume(timeline);
  const unlabelledShapes = [...series]
    .sort((left, right) => bandOf({ timeline, id: right.key }).volume - bandOf({ timeline, id: left.key }).volume)
    .map((points) => {
      const band = bandOf({ timeline, id: points.key });
      return {
        band,
        points,
        path: closedPathOf({ bandId: band.id, values: points.map((point): [number, number] => [point[0], point[1]]) }),
        agentPath: agentPathOf({ band, points }),
        saturation: saturationOf({ volume: band.volume, maxVolume }),
      };
    });
  const { shapes } = unlabelledShapes.reduce<{ shapes: BandShape[]; placed: LabelBox[] }>(
    ({ shapes: done, placed }, { band, points, path, agentPath, saturation }) => {
      const placedLabel = labelBoxOf({ band, points, binX, segments, y, placed });
      if (placedLabel === null) return { shapes: [...done, { band, path, saturation, label: null, agentPath }], placed };
      return {
        shapes: [...done, { band, path, saturation, label: placedLabel.label, agentPath }],
        placed: [...placed, placedLabel.box],
      };
    },
    { shapes: [], placed: [] },
  );
  function breakAt(position: number): BreakColumn | null {
    const column = breaks.find((candidate) => position > candidate.left && position < candidate.right);
    if (!column) return null;
    return column;
  }

  return {
    shapes,
    breaks,
    binX,
    breakAt,
    binAt: (position) => {
      const column = breakAt(position);
      if (column) return column.lastIndex + 1;
      return slots.reduce((nearest, slot) => (Math.abs(slot.x - position) <= Math.abs(nearest.x - position) ? slot : nearest), {
        index: 0,
        x: 0,
      }).index;
    },
    timeX: (time) => {
      const position = Math.min(lastIndex, Math.max(0, (time - firstBinStart(timeline)) / timeline.binMs));
      const index = Math.floor(position);
      const isInsideBreak = breaks.some((candidate) =>
        containsIndex({ range: { first: candidate.firstIndex, last: candidate.lastIndex }, index }),
      );
      if (isInsideBreak) return binX(index);
      return binX(index) + (position - index) * (binX(Math.min(lastIndex, index + 1)) - binX(index));
    },
  };
}
