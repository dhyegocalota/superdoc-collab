import { ConnectionFailureReason } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { FAILED_TITLE, FAILURE_REASON_COPY, UNSYNCED_LOST_ON_RELOAD_DETAIL } from './connection-copy';

const MAX_TITLE_LENGTH = 45;
const MAX_REASON_LENGTH = 40;
const MAX_DETAIL_LENGTH = 70;

test('the Failed title is short enough for a phone', () => {
  expect(FAILED_TITLE.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
});

test.each(Object.values(ConnectionFailureReason))('the %s reason is short enough for a phone', (reason) => {
  expect(FAILURE_REASON_COPY[reason].length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
});

test('the unsynced warning is short enough for a phone', () => {
  expect(UNSYNCED_LOST_ON_RELOAD_DETAIL.length).toBeLessThanOrEqual(MAX_DETAIL_LENGTH);
});
