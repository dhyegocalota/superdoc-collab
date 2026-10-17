import { toStackRows, type StackRow } from '@superdoc-collab/history/timeline';
import type { DocumentTimeline, TimelineBand } from '@superdoc-collab/types';
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import { area, curveBasis, stack, stackOffsetWiggle, stackOrderInsideOut, type Series, type SeriesPoint } from 'd3-shape';
import { maxBandVolume } from './max-band-volume';

export const CHART_HEIGHT = 240;
export const MIN_LABEL_HEIGHT = 16;
export const SATURATION_MIN = 35;
export const SATURATION_MAX = 85;
const CHART_PADDING = 8;
const LABEL_CHARACTER_WIDTH = 7;
const HALF = 2;

type StackSeries = Series<StackRow, string>;
type LabelBox = { left: number; right: number; top: number; bottom: number };
export type BandShape = { band: TimelineBand; path: string; saturation: number; label: { x: number; y: number } | null };
type PlacedLabel = { label: { x: number; y: number }; box: LabelBox };
export type StreamgraphLayout = { shapes: BandShape[]; binX: (index: number) => number; binAt: (position: number) => number };

class MissingStackValueError extends Error {}
class MissingBandError extends Error {}
class EmptyBandPathError extends Error {}

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

function labelBoxOf({
  band,
  points,
  x,
  y,
  placed,
}: {
  band: TimelineBand;
  points: StackSeries;
  x: ScaleLinear<number, number>;
  y: ScaleLinear<number, number>;
  placed: LabelBox[];
}): PlacedLabel | null {
  const thickness = points.map((point) => y(point[0]) - y(point[1]));
  const halfWidth = (band.name.length * LABEL_CHARACTER_WIDTH) / HALF;

  function fitsAt(index: number): boolean {
    const firstBin = Math.floor(x.invert(x(index) - halfWidth));
    const lastBin = Math.ceil(x.invert(x(index) + halfWidth));
    const isInsideChart = firstBin >= 0 && lastBin < points.length;
    return isInsideChart && thickness.slice(firstBin, lastBin + 1).every((value) => value >= MIN_LABEL_HEIGHT);
  }

  const candidates = thickness.map((value, index) => ({ value, index })).filter(({ index }) => fitsAt(index));
  if (candidates.length === 0) return null;
  const { index } = candidates.reduce((best, candidate) => (candidate.value > best.value ? candidate : best));
  const centerX = x(index);
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
  const x = scaleLinear()
    .domain([0, Math.max(1, lastIndex)])
    .range([0, width]);
  const lowest = Math.min(0, ...series.flatMap((points) => points.map((point) => point[0])));
  const highest = Math.max(lowest + 1, ...series.flatMap((points) => points.map((point) => point[1])));
  const y = scaleLinear()
    .domain([lowest, highest])
    .range([CHART_HEIGHT - CHART_PADDING, CHART_PADDING]);
  const shapeOf = area<SeriesPoint<StackRow>>()
    .x((_, index) => x(index))
    .y0((point) => y(point[0]))
    .y1((point) => y(point[1]))
    .curve(curveBasis);
  const maxVolume = maxBandVolume(timeline);
  const unlabelledShapes = [...series]
    .sort((left, right) => bandOf({ timeline, id: right.key }).volume - bandOf({ timeline, id: left.key }).volume)
    .map((points) => {
      const band = bandOf({ timeline, id: points.key });
      const path = shapeOf(points);
      if (!path) throw new EmptyBandPathError(band.id);
      return { band, points, path: `${path}Z`, saturation: saturationOf({ volume: band.volume, maxVolume }) };
    });
  const { shapes } = unlabelledShapes.reduce<{ shapes: BandShape[]; placed: LabelBox[] }>(
    ({ shapes: done, placed }, { band, points, path, saturation }) => {
      const placedLabel = labelBoxOf({ band, points, x, y, placed });
      if (placedLabel === null) return { shapes: [...done, { band, path, saturation, label: null }], placed };
      return { shapes: [...done, { band, path, saturation, label: placedLabel.label }], placed: [...placed, placedLabel.box] };
    },
    { shapes: [], placed: [] },
  );
  return { shapes, binX: (index) => x(index), binAt: (position) => Math.min(lastIndex, Math.max(0, Math.round(x.invert(position)))) };
}
