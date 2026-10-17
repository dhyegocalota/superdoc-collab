import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { layoutStreamgraph, MIN_LABEL_HEIGHT, SATURATION_MAX, SATURATION_MIN, saturationOf } from './streamgraph-layout';

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
