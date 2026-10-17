import { TopicState, type EditSelection } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { errorForSelection, selectionVolume, timelineStamp } from './selection-summary';

const timeline = timelineWith({
  volumes: [
    [10, 0],
    [0, 5],
  ],
  names: ['Budget', 'Hiring'],
});
const NO_SELECTION: EditSelection = { term: null, author: null, topic: null, at: null };

test('the volume of a selection follows its topic and period', () => {
  expect(selectionVolume({ timeline, selection: NO_SELECTION })).toBe(15);
  expect(selectionVolume({ timeline, selection: { ...NO_SELECTION, topic: 'band-1' } })).toBe(5);
  expect(selectionVolume({ timeline, selection: { ...NO_SELECTION, at: timeline.bins[0]!.start } })).toBe(10);
  expect(selectionVolume({ timeline, selection: { ...NO_SELECTION, at: timeline.bins[0]!.start, topic: 'band-1' } })).toBe(0);
  expect(selectionVolume({ timeline, selection: { ...NO_SELECTION, at: 1 } })).toBe(0);
});

test('an error belongs only to the selection that caused it', () => {
  const error = new Error('too soon');
  expect(errorForSelection({ error, variables: NO_SELECTION, selection: NO_SELECTION })).toBe(error);
  expect(errorForSelection({ error, variables: NO_SELECTION, selection: { ...NO_SELECTION, author: 'bruno' } })).toBeNull();
  expect(errorForSelection({ error: null, variables: NO_SELECTION, selection: NO_SELECTION })).toBeNull();
});

test('the timeline stamp moves with every edit in the document and with every topic compute', () => {
  const stamp = timelineStamp(timeline);
  expect(timelineStamp({ ...timeline })).toBe(stamp);
  expect(timelineStamp({ ...timeline, projection: { ...timeline.projection, cursor: 99 } })).not.toBe(stamp);
  expect(timelineStamp({ ...timeline, topics: { ...timeline.topics, state: TopicState.Pending } })).not.toBe(stamp);
  expect(timelineStamp({ ...timeline, topics: { ...timeline.topics, computedAtSequence: 99 } })).not.toBe(stamp);
});
