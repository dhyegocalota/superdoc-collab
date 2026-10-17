import { expect, test } from 'vitest';
import { timelineWith } from '@/test/timeline-fixtures';
import { layoutStreamgraph, MIN_LABEL_HEIGHT, SATURATION_MAX, SATURATION_MIN, saturationOf } from './streamgraph-layout';

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
