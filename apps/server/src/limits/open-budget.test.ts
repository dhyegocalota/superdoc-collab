import { BOOTSTRAP_SCAN_CACHE_ENTRIES, OPEN_UNCOMMITTED_PER_MINUTE, SECOND_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { OpenBudget } from './open-budget';

const WINDOW_MS = 10 * SECOND_MS;
const MAX_DOCUMENTS = 2;
const USER = 'user-1';

function budgetAt(start: number): { budget: OpenBudget; advance: (milliseconds: number) => void } {
  const clock = { time: start };
  return {
    budget: new OpenBudget({ windowMs: WINDOW_MS, maxDocuments: MAX_DOCUMENTS, now: () => clock.time }),
    advance: (milliseconds) => {
      clock.time += milliseconds;
    },
  };
}

test('repeated opens of one document cost one entry', () => {
  const { budget } = budgetAt(0);
  Array.from({ length: MAX_DOCUMENTS * 5 }).forEach(() => budget.record({ userId: USER, documentId: 'a' }));
  expect(budget.waitMs({ userId: USER, documentId: 'b' })).toBeNull();
});

test('a user at the budget waits for a new document but not for one already counted', () => {
  const { budget, advance } = budgetAt(0);
  ['a', 'b'].forEach((documentId) => budget.record({ userId: USER, documentId }));
  advance(4 * SECOND_MS);
  expect(budget.waitMs({ userId: USER, documentId: 'c' })).toBe(6 * SECOND_MS);
  expect(budget.waitMs({ userId: USER, documentId: 'a' })).toBeNull();
});

test('a document is counted again once the window has passed', () => {
  const { budget, advance } = budgetAt(0);
  ['a', 'b'].forEach((documentId) => budget.record({ userId: USER, documentId }));
  advance(WINDOW_MS + 1);
  expect(budget.waitMs({ userId: USER, documentId: 'c' })).toBeNull();
});

test('users do not share a budget', () => {
  const { budget } = budgetAt(0);
  ['a', 'b'].forEach((documentId) => budget.record({ userId: USER, documentId }));
  expect(budget.waitMs({ userId: 'user-2', documentId: 'c' })).toBeNull();
});

test('a pair past the window is forgotten at the next record', () => {
  const { budget, advance } = budgetAt(0);
  budget.record({ userId: USER, documentId: 'a' });
  advance(WINDOW_MS + 1);
  budget.record({ userId: USER, documentId: 'b' });
  expect(budget.trackedPairs()).toBe(1);
});

test('the open budget of a user never exceeds the scan cache, so one user cannot evict every other document', () => {
  expect(OPEN_UNCOMMITTED_PER_MINUTE).toBeLessThanOrEqual(BOOTSTRAP_SCAN_CACHE_ENTRIES);
});
