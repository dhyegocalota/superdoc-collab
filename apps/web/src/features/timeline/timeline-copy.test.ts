import { HISTORY_CATCHING_UP_MESSAGE, HttpStatus } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { requestFailedMessage } from '@/lib/api';
import { bandAriaLabel, editDeltaLabel, EditUnit } from './timeline-copy';

test.each([
  { inserted: 2, deleted: 0, unit: EditUnit.Word, expected: '+2 words' },
  { inserted: 1, deleted: 0, unit: EditUnit.Word, expected: '+1 word' },
  { inserted: 0, deleted: 3, unit: EditUnit.Character, expected: '−3 characters' },
  { inserted: 12, deleted: 1, unit: EditUnit.Word, expected: '+12 words −1 word' },
  { inserted: 0, deleted: 0, unit: EditUnit.Word, expected: '0 words' },
])('$inserted inserted and $deleted deleted read "$expected"', ({ inserted, deleted, unit, expected }) => {
  expect(editDeltaLabel({ inserted, deleted, unit })).toBe(expected);
});

test('a band of one character is singular and an empty band is plural', () => {
  expect(bandAriaLabel({ name: 'Budget', volume: 1 })).toBe('Budget, 1 character');
  expect(bandAriaLabel({ name: 'Budget', volume: 0 })).toBe('Budget, 0 characters');
});

test('messages with a verb end with a period', () => {
  expect(requestFailedMessage({ subject: 'Timeline request', status: HttpStatus.ServiceUnavailable })).toBe(
    'Timeline request failed with status 503.',
  );
  expect(HISTORY_CATCHING_UP_MESSAGE).toBe('History is catching up.');
});
