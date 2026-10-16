import { expect, test } from 'vitest';
import { summariesOutputSchema, topicsOutputSchema } from './topic-schema';

const NAME_LIMIT = 40;
const SENTENCE_LIMIT = 200;
const ACCEPTED_LIMIT = 20;

function topics(count: number) {
  return { topics: Array.from({ length: count }, (_, index) => ({ name: `Topic ${index}`, blockIds: [`b${index}`] })) };
}

test('rejects an empty topic list', () => {
  expect(topicsOutputSchema.safeParse({ topics: [] }).success).toBe(false);
});

test('rejects a topic without blocks', () => {
  expect(topicsOutputSchema.safeParse({ topics: [{ name: 'Budget', blockIds: [] }] }).success).toBe(false);
});

test('rejects names that are duplicates after trim and case', () => {
  const output = { topics: [{ name: 'Budget', blockIds: ['b1'] }, { name: ' budget ', blockIds: ['b2'] }] };
  expect(topicsOutputSchema.safeParse(output).success).toBe(false);
});

test('rejects a name over the limit', () => {
  expect(topicsOutputSchema.safeParse({ topics: [{ name: 'x'.repeat(NAME_LIMIT + 1), blockIds: ['b1'] }] }).success).toBe(false);
  expect(topicsOutputSchema.safeParse({ topics: [{ name: 'x'.repeat(NAME_LIMIT), blockIds: ['b1'] }] }).success).toBe(true);
});

test('accepts up to the accepted limit and rejects beyond it', () => {
  expect(topicsOutputSchema.safeParse(topics(1)).success).toBe(true);
  expect(topicsOutputSchema.safeParse(topics(12)).success).toBe(true);
  expect(topicsOutputSchema.safeParse(topics(ACCEPTED_LIMIT + 1)).success).toBe(false);
});

test('summaries reject a long sentence and accept none', () => {
  expect(summariesOutputSchema.safeParse({ summaries: [{ topicId: 't1', sentence: 'x'.repeat(SENTENCE_LIMIT + 1) }] }).success).toBe(false);
  expect(summariesOutputSchema.safeParse({ summaries: [] }).success).toBe(true);
});
