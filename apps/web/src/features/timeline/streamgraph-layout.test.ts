import { DAY_MS, MINUTE_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import {
  BREAK_WIDTH_PX,
  CHART_HEIGHT,
  layoutStreamgraph,
  MIN_LABEL_HEIGHT,
  SATURATION_MAX,
  SATURATION_MIN,
  saturationOf,
} from './streamgraph-layout';

const RAMP_HALF_LENGTH = 8;

function rampThrough({ start, middle, end }: { start: number; middle: number; end: number }): number[] {
  const rise = Array.from({ length: RAMP_HALF_LENGTH }, (_, index) => start + ((middle - start) * index) / RAMP_HALF_LENGTH);
  const fall = Array.from({ length: RAMP_HALF_LENGTH + 1 }, (_, index) => middle + ((end - middle) * index) / RAMP_HALF_LENGTH);
  return [...rise, ...fall];
}

test('one filled bin renders a closed band with its label hidden', () => {
  const timeline = timelineWith({ volumes: [[0], [5], [0]], names: ['Budget'] });
  const [shape] = layoutStreamgraph({ timeline, width: 420 }).shapes;
  expect(shape!.path.startsWith('M')).toBe(true);
  expect(shape!.path.endsWith('Z')).toBe(true);
  expect(shape!.label).toBeNull();
});

test('labels sit inside thick bands and never overlap', () => {
  const timeline = timelineWith({
    volumes: Array.from({ length: 60 }, (_, index) => [400, 300, index === 30 ? 2 : 1]),
    names: ['Budget', 'Hiring', 'Tiny'],
  });
  const shapes = layoutStreamgraph({ timeline, width: 600 }).shapes;
  const labels = shapes.filter((shape) => shape.label !== null);
  expect(labels.map((shape) => shape.band.name).sort()).toEqual(['Budget', 'Hiring']);
  expect(Math.abs(labels[0]!.label!.y - labels[1]!.label!.y)).toBeGreaterThanOrEqual(MIN_LABEL_HEIGHT);
});

test('saturation grows linearly with volume', () => {
  expect(saturationOf({ volume: 0, maxVolume: 10 })).toBe(SATURATION_MIN);
  expect(saturationOf({ volume: 10, maxVolume: 10 })).toBe(SATURATION_MAX);
  expect(saturationOf({ volume: 5, maxVolume: 10 })).toBe((SATURATION_MIN + SATURATION_MAX) / 2);
  expect(saturationOf({ volume: 0, maxVolume: 0 })).toBe(SATURATION_MIN);
});

test('binAt maps a pixel to the nearest bin and binX maps it back', () => {
  const timeline = timelineWith({ volumes: [[1], [2], [3], [4], [5]], names: ['Budget'] });
  const layout = layoutStreamgraph({ timeline, width: 400 });
  expect(layout.binX(0)).toBe(0);
  expect(layout.binX(4)).toBe(400);
  expect(layout.binAt(-50)).toBe(0);
  expect(layout.binAt(210)).toBe(2);
  expect(layout.binAt(900)).toBe(4);
});

test('label positions stay where they are for a crowded chart', () => {
  const timeline = timelineWith({
    volumes: Array.from({ length: 40 }, (_, index) => [400, 380, 360, index % 2 === 0 ? 300 : 20, 15]),
    names: ['Budget', 'Hiring', 'Marketing', 'Legal', 'Tiny'],
  });
  const labels = layoutStreamgraph({ timeline, width: 480 }).shapes.map((shape) => ({ name: shape.band.name, label: shape.label }));
  expect(labels).toMatchInlineSnapshot(`
    [
      {
        "label": {
          "x": 443.0769230769231,
          "y": 119.22167360473262,
        },
        "name": "Budget",
      },
      {
        "label": {
          "x": 49.230769230769226,
          "y": 121.838365897982,
        },
        "name": "Hiring",
      },
      {
        "label": {
          "x": 61.53846153846153,
          "y": 79.91495921454671,
        },
        "name": "Marketing",
      },
      {
        "label": null,
        "name": "Legal",
      },
      {
        "label": null,
        "name": "Tiny",
      },
    ]
  `);
});

test('a thick band whose label would cover a placed one stays unlabelled', () => {
  const ramps = [
    rampThrough({ start: 300, middle: 100, end: 340 }),
    rampThrough({ start: 100, middle: 340, end: 100 }),
    rampThrough({ start: 100, middle: 400, end: 100 }),
    rampThrough({ start: 60, middle: 260, end: 100 }),
    rampThrough({ start: 260, middle: 260, end: 300 }),
  ];
  const timeline = timelineWith({
    volumes: ramps[0]!.map((_, binIndex) => ramps.map((ramp) => ramp[binIndex]!)),
    names: ['Budget review', 'Hiring plan', 'Marketing push', 'Legal terms', 'Roadmap'],
  });
  const shapes = layoutStreamgraph({ timeline, width: 300 }).shapes;
  const unlabelled = shapes.filter((shape) => shape.label === null).map((shape) => shape.band.name);
  expect(unlabelled).toEqual(['Budget review']);
});

test('a band without agent volume has no agent path and a band with agent volume has a closed one', () => {
  const timeline = timelineWith({
    volumes: [
      [40, 10],
      [50, 10],
      [60, 10],
    ],
    names: ['Budget', 'Hiring'],
    agentVolumes: [
      [0, 0],
      [20, 0],
      [30, 0],
    ],
  });
  const shapes = layoutStreamgraph({ timeline, width: 420 }).shapes;
  const budget = shapes.find((shape) => shape.band.name === 'Budget')!;
  const hiring = shapes.find((shape) => shape.band.name === 'Hiring')!;
  expect(budget.agentPath).toMatch(/^M.*Z$/);
  expect(budget.agentPath).not.toBe(budget.path);
  expect(hiring.agentPath).toBeNull();
});

test('timeX maps a moment to the x of its fractional bin and clamps outside the span', () => {
  const timeline = timelineWith({ volumes: [[1], [2], [3], [4], [5]], names: ['Budget'] });
  const layout = layoutStreamgraph({ timeline, width: 400 });
  const { binMs } = timeline;
  const secondBinStart = timeline.bins[1]!.start;
  expect(layout.timeX(timeline.bins[0]!.start)).toBe(layout.binX(0));
  expect(layout.timeX(secondBinStart)).toBe(layout.binX(1));
  expect(layout.timeX(secondBinStart + binMs / 2)).toBe((layout.binX(1) + layout.binX(2)) / 2);
  expect(layout.timeX(timeline.bins[0]!.start - binMs)).toBe(layout.binX(0));
  expect(layout.timeX(timeline.bins[4]!.start + 10 * binMs)).toBe(layout.binX(4));
});

test('pin: the agent layer is as tall as the agent share of the band', () => {
  const timeline = timelineWith({ volumes: [[10], [10], [10]], names: ['Budget'], agentVolumes: [[4], [4], [4]] });
  const [shape] = layoutStreamgraph({ timeline, width: 420 }).shapes;
  const heightOf = (path: string): number => {
    const numbers = path.match(/-?\d+(\.\d+)?/g);
    expect(numbers).not.toBeNull();
    const ys = numbers!.map(Number).filter((_, index) => index % 2 === 1);
    return Math.max(...ys) - Math.min(...ys);
  };
  expect(heightOf(shape!.agentPath!) / heightOf(shape!.path)).toBeCloseTo(0.4, 3);
});

const LABEL_CHARACTER_WIDTH = 7;
const EDGE_BINS = 4;
const SILENT_BINS = 6;
const SILENCE_FIRST = EDGE_BINS;
const SILENCE_LAST = EDGE_BINS + SILENT_BINS - 1;
const AFTER_SILENCE = SILENCE_LAST + 1;
const LAST_BIN = 2 * EDGE_BINS + SILENT_BINS - 1;
const CHART_WIDTH = 600;
const PITCH = (CHART_WIDTH - BREAK_WIDTH_PX) / (2 * EDGE_BINS - 2);
const BUSY: number[] = [400, 300];
const QUIET: number[] = [0, 0];
const AGENT_BUSY: number[] = [40, 30];

function silentTimeline({ names = ['Budget', 'Hiring'], agent = false }: { names?: string[]; agent?: boolean } = {}) {
  const rows = [
    ...Array.from({ length: EDGE_BINS }, () => BUSY),
    ...Array.from({ length: SILENT_BINS }, () => QUIET),
    ...Array.from({ length: EDGE_BINS }, () => BUSY),
  ];
  const agentVolumes = rows.map((row) => row.map((volume) => (agent && volume > 0 ? AGENT_BUSY[0]! : 0)));
  return timelineWith({ volumes: rows, names, agentVolumes });
}

function silentLayout(options: Parameters<typeof silentTimeline>[0] = {}) {
  const timeline = silentTimeline(options);
  return { timeline, layout: layoutStreamgraph({ timeline, width: CHART_WIDTH }) };
}

test('a break is one column between its neighbours', () => {
  const { layout } = silentLayout();
  const [column] = layout.breaks;
  expect(layout.breaks).toHaveLength(1);
  expect(column).toMatchObject({ firstIndex: SILENCE_FIRST, lastIndex: SILENCE_LAST, durationMs: SILENT_BINS * MINUTE_MS });
  expect(column!.right - column!.left).toBeCloseTo(BREAK_WIDTH_PX);
  expect(column!.centerX).toBeCloseTo((column!.left + column!.right) / 2);
  expect(layout.binX(0)).toBe(0);
  expect(layout.binX(LAST_BIN)).toBeCloseTo(CHART_WIDTH);
});

test('the bins on either side of a break keep the same pitch', () => {
  const { layout } = silentLayout();
  expect(layout.binX(1) - layout.binX(0)).toBeCloseTo(PITCH);
  expect(layout.binX(LAST_BIN) - layout.binX(LAST_BIN - 1)).toBeCloseTo(PITCH);
  expect(layout.binX(AFTER_SILENCE) - layout.binX(SILENCE_FIRST - 1)).toBeCloseTo(BREAK_WIDTH_PX);
});

test('a bin inside the break sits at the centre of its column', () => {
  const { layout } = silentLayout();
  const [column] = layout.breaks;
  Array.from({ length: SILENT_BINS }, (_, offset) => SILENCE_FIRST + offset).forEach((index) => {
    expect(layout.binX(index)).toBeCloseTo(column!.centerX);
  });
});

test('binAt gives the first bin after the break inside its column and the nearest bin elsewhere', () => {
  const { layout } = silentLayout();
  const [column] = layout.breaks;
  expect(layout.binAt(column!.centerX)).toBe(AFTER_SILENCE);
  expect(layout.binAt(column!.left)).toBe(SILENCE_FIRST - 1);
  expect(layout.binAt(column!.right)).toBe(AFTER_SILENCE);
  expect(layout.binAt(-50)).toBe(0);
  expect(layout.binAt(CHART_WIDTH + 50)).toBe(LAST_BIN);
  expect(layout.binAt(layout.binX(1) + 1)).toBe(1);
});

test('binAt inverts binX for every bin outside the break', () => {
  const { layout, timeline } = silentLayout();
  const outsideBreak = timeline.bins.map((_, index) => index).filter((index) => index < SILENCE_FIRST || index > SILENCE_LAST);
  outsideBreak.forEach((index) => expect(layout.binAt(layout.binX(index))).toBe(index));
});

test('timeX maps a time inside the break to the column centre and other times linearly', () => {
  const { layout, timeline } = silentLayout();
  const [column] = layout.breaks;
  const firstStart = timeline.bins[0]!.start;
  expect(layout.timeX(firstStart + (SILENCE_FIRST + 3) * MINUTE_MS)).toBeCloseTo(column!.centerX);
  expect(layout.timeX(firstStart + 1.5 * MINUTE_MS)).toBeCloseTo((layout.binX(1) + layout.binX(2)) / 2);
  expect(layout.timeX(firstStart - MINUTE_MS)).toBe(0);
  expect(layout.timeX(timeline.bins[LAST_BIN]!.end + MINUTE_MS)).toBeCloseTo(CHART_WIDTH);
});

test('a band with volume on both sides of the break has one closed path per side', () => {
  const { layout } = silentLayout();
  layout.shapes.forEach((shape) => {
    expect(shape.path.match(/M/g)).toHaveLength(2);
    expect(shape.path.endsWith('Z')).toBe(true);
  });
});

test('agent volume on both sides gives one closed agent path per side', () => {
  const { layout } = silentLayout({ agent: true });
  layout.shapes.forEach((shape) => {
    expect(shape.agentPath!.match(/M/g)).toHaveLength(2);
    expect(shape.agentPath!.endsWith('Z')).toBe(true);
  });
});

test('a label never straddles the break', () => {
  const longName = 'x'.repeat(40);
  const { layout } = silentLayout({ names: [longName, 'Hiring'] });
  const [column] = layout.breaks;
  const halfWidth = (longName.length * LABEL_CHARACTER_WIDTH) / 2;
  const wide = layout.shapes.find((shape) => shape.band.name === longName)!;
  const fitsLeft = wide.label !== null && wide.label.x + halfWidth <= column!.left;
  const fitsRight = wide.label !== null && wide.label.x - halfWidth >= column!.right;
  expect(wide.label === null || fitsLeft || fitsRight).toBe(true);
});

test('a timeline of only two bins and one break keeps finite positions', () => {
  const rows = [BUSY, ...Array.from({ length: SILENT_BINS }, () => QUIET), BUSY];
  const timeline = timelineWith({ volumes: rows, names: ['Budget', 'Hiring'] });
  const layout = layoutStreamgraph({ timeline, width: CHART_WIDTH });
  rows.forEach((_, index) => expect(Number.isFinite(layout.binX(index))).toBe(true));
  expect(layout.binX(0)).toBe(0);
  expect(layout.binX(rows.length - 1)).toBeCloseTo(CHART_WIDTH);
});

test('a timeline without a break has no column', () => {
  const timeline = timelineWith({ volumes: [[1], [2], [3], [4], [5]], names: ['Budget'] });
  expect(layoutStreamgraph({ timeline, width: 400 }).breaks).toEqual([]);
});

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;
const COORDINATES_PER_POINT = 2;

function subpathWidths(path: string): number[] {
  return path
    .split('Z')
    .filter((subpath) => subpath !== '')
    .map((subpath) => {
      const xs = Array.from(subpath.matchAll(NUMBER_PATTERN), ([value]) => Number(value)).filter(
        (_, index) => index % COORDINATES_PER_POINT === 0,
      );
      return Math.max(...xs) - Math.min(...xs);
    });
}

function islandRows(): number[][] {
  return [
    ...Array.from({ length: EDGE_BINS }, () => BUSY),
    ...Array.from({ length: SILENT_BINS }, () => QUIET),
    BUSY,
    ...Array.from({ length: SILENT_BINS }, () => QUIET),
    ...Array.from({ length: EDGE_BINS }, () => BUSY),
  ];
}

test('an edit island of one bin between two breaks keeps a drawn width at minute bins', () => {
  const timeline = timelineWith({ volumes: islandRows(), names: ['Budget', 'Hiring'] });
  const layout = layoutStreamgraph({ timeline, width: CHART_WIDTH });
  expect(layout.breaks).toHaveLength(2);
  layout.shapes.forEach((shape) => {
    const widths = subpathWidths(shape.path);
    expect(widths).toHaveLength(3);
    widths.forEach((width) => expect(width).toBeGreaterThan(0));
  });
});

test('edits on alternate days keep every segment drawn at day bins', () => {
  const rows = [BUSY, QUIET, BUSY, QUIET, BUSY];
  const minuteTimeline = timelineWith({ volumes: rows, names: ['Budget', 'Hiring'] });
  const firstStart = minuteTimeline.bins[0]!.start;
  const bins = minuteTimeline.bins.map((bin, index) => ({
    ...bin,
    start: firstStart + index * DAY_MS,
    end: firstStart + (index + 1) * DAY_MS,
  }));
  const timeline = { ...minuteTimeline, binMs: DAY_MS, bins };
  const layout = layoutStreamgraph({ timeline, width: CHART_WIDTH });
  expect(layout.breaks).toHaveLength(2);
  layout.shapes.forEach((shape) => {
    const widths = subpathWidths(shape.path);
    expect(widths).toHaveLength(3);
    widths.forEach((width) => expect(width).toBeGreaterThan(0));
  });
});

const LATE_IN_BIN = 0.9;

test('a time late in the last bin before a break stays at that bin, not on the divider', () => {
  const { layout, timeline } = silentLayout();
  const lastBinBefore = SILENCE_FIRST - 1;
  const time = timeline.bins[lastBinBefore]!.start + LATE_IN_BIN * MINUTE_MS;
  expect(layout.timeX(time)).toBeCloseTo(layout.binX(lastBinBefore));
});

const DENSE_EDGE_BINS = 50;
const DENSE_SILENT_BINS = 20;
const NARROW_CHART_WIDTH = 375;

test('on a dense narrow chart the break column shrinks to one interval between visible bins', () => {
  const rows = [
    ...Array.from({ length: DENSE_EDGE_BINS }, () => BUSY),
    ...Array.from({ length: DENSE_SILENT_BINS }, () => QUIET),
    ...Array.from({ length: DENSE_EDGE_BINS }, () => BUSY),
  ];
  const timeline = timelineWith({ volumes: rows, names: ['Budget', 'Hiring'] });
  const [column] = layoutStreamgraph({ timeline, width: NARROW_CHART_WIDTH }).breaks;
  const visibleIntervals = 2 * DENSE_EDGE_BINS - 1;
  expect(column!.right - column!.left).toBeCloseTo(NARROW_CHART_WIDTH / visibleIntervals);
  expect(column!.right - column!.left).toBeLessThan(BREAK_WIDTH_PX);
});

test('bandCenterY is the middle of the band at a bin, inside the chart, and differs per band', () => {
  const timeline = timelineWith({
    volumes: [
      [300, 100],
      [300, 100],
    ],
    names: ['Budget', 'Hiring'],
  });
  const layout = layoutStreamgraph({ timeline, width: 420 });
  const [budget, hiring] = timeline.bands.map((band) => layout.bandCenterY({ bandId: band.id, index: 1 }));
  expect(budget).toBeGreaterThan(0);
  expect(hiring).toBeLessThan(CHART_HEIGHT);
  expect(budget).not.toBe(hiring);
});

test('bandCenterY rejects a band or a bin the chart does not have', () => {
  const timeline = timelineWith({ volumes: [[3], [4]], names: ['Budget'] });
  const layout = layoutStreamgraph({ timeline, width: 420 });
  expect(() => layout.bandCenterY({ bandId: 'missing', index: 0 })).toThrow();
  expect(() => layout.bandCenterY({ bandId: timeline.bands[0]!.id, index: 2 })).toThrow();
});
