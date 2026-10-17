import { TopicState } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { timelineStamp } from './selection-summary';

const timeline = timelineWith({ volumes: [[10, 5]], names: ['Budget', 'Hiring'] });

test('the timeline stamp moves with every edit in the document and with every topic compute', () => {
  const stamp = timelineStamp(timeline);
  expect(timelineStamp({ ...timeline })).toBe(stamp);
  expect(timelineStamp({ ...timeline, projection: { ...timeline.projection, cursor: 99 } })).not.toBe(stamp);
  expect(timelineStamp({ ...timeline, topics: { ...timeline.topics, state: TopicState.Pending } })).not.toBe(stamp);
  expect(timelineStamp({ ...timeline, topics: { ...timeline.topics, computedAtSequence: 99 } })).not.toBe(stamp);
});
