import { OTHER_BAND_ID } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { assignBlocks, matchPreviousTopics, normalizeTopics, topicBandId } from './topic-assignment';

const KNOWN_BLOCKS = 300;
const KNOWN = new Set(Array.from({ length: KNOWN_BLOCKS }, (_, index) => `b${index}`));

function topic({ name, count, offset }: { name: string; count: number; offset: number }) {
  return { name, blockIds: Array.from({ length: count }, (_, index) => `b${offset + index}`) };
}

test('twelve topics keep the eight largest in the order the model gave', () => {
  const output = { topics: Array.from({ length: 12 }, (_, index) => topic({ name: `T${index}`, count: index + 1, offset: index * 20 })) };
  const { topics } = normalizeTopics({ output, knownBlockIds: KNOWN });
  expect(topics.map((kept) => kept.name)).toEqual(['T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11']);
});

test('unknown block ids are dropped and reported', () => {
  const { topics, unknownBlockIds } = normalizeTopics({
    output: {
      topics: [
        { name: 'Budget', blockIds: ['b1', 'gone', 'b2'] },
        { name: 'Ghost', blockIds: ['gone'] },
      ],
    },
    knownBlockIds: KNOWN,
  });
  expect(topics).toEqual([{ name: 'Budget', blockIds: ['b1', 'b2'] }]);
  expect(unknownBlockIds).toEqual(['gone']);
});

test('one topic is kept as is', () => {
  const output = { topics: [{ name: 'Only', blockIds: ['b1', 'b2'] }] };
  expect(normalizeTopics({ output, knownBlockIds: KNOWN }).topics).toEqual(output.topics);
});

test('a block claimed twice stays with the first topic', () => {
  const output = {
    topics: [
      { name: 'First', blockIds: ['b1', 'b2'] },
      { name: 'Second', blockIds: ['b2', 'b3'] },
    ],
  };
  expect(normalizeTopics({ output, knownBlockIds: KNOWN }).topics).toEqual([
    { name: 'First', blockIds: ['b1', 'b2'] },
    { name: 'Second', blockIds: ['b3'] },
  ]);
});

test('a recomputed topic keeps the id of the topic it mostly covers', () => {
  const previous = [
    { id: 't1', blockIds: ['b1', 'b2', 'b3'] },
    { id: 't2', blockIds: ['b4'] },
  ];
  const next = [
    { name: 'Costs', blockIds: ['b1', 'b2', 'b9'] },
    { name: 'Team', blockIds: ['b4', 'b5', 'b6'] },
    { name: 'New', blockIds: ['b7'] },
  ];
  expect(matchPreviousTopics({ previous, next }).map((matched) => matched.id)).toEqual(['t1', null, null]);
});

test('exactly half of the blocks from an earlier topic keeps its id', () => {
  const previous = [{ id: 't1', blockIds: ['b1', 'b9'] }];
  const next = [{ name: 'Half', blockIds: ['b1', 'b2'] }];
  expect(matchPreviousTopics({ previous, next }).map((matched) => matched.id)).toEqual(['t1']);
});

test('an id is reused at most once, by the larger overlap', () => {
  const previous = [{ id: 't1', blockIds: ['b1', 'b2', 'b3', 'b4'] }];
  const next = [
    { name: 'Small', blockIds: ['b1', 'b2'] },
    { name: 'Large', blockIds: ['b1', 'b2', 'b3', 'b4'] },
  ];
  expect(matchPreviousTopics({ previous, next }).map((matched) => matched.id)).toEqual([null, 't1']);
});

test('assigned blocks resolve to their topic and the rest to Other', () => {
  const assignment = assignBlocks([{ id: 't1', blockIds: ['b1', 'b2'] }]);
  expect(topicBandId({ assignment, blockId: 'b1' })).toBe('t1');
  expect(topicBandId({ assignment, blockId: 'b99' })).toBe(OTHER_BAND_ID);
});
