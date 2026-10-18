import { ConnectionFailureReason } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import {
  actionLabelFor,
  FAILED_TITLE,
  FAILURE_REASON_COPY,
  UNSYNCED_LOST_ON_RELOAD_DETAIL,
  UNSYNCED_LOST_ON_SIGN_IN_DETAIL,
  RELOAD_LABEL,
  SIGN_IN_LABEL,
  SUPERSEDED_DOWNLOAD_DETAIL,
  unsyncedDetailFor,
} from './connection-copy';
import { BACK_TO_DOCUMENTS_LABEL } from './editor-copy';

const MAX_TITLE_LENGTH = 41;
const MAX_REASON_LENGTH = 40;
const MAX_DETAIL_LENGTH = 70;
const MAX_PARAGRAPH_LENGTH = 100;

test('the Failed title is short enough for a phone', () => {
  expect(FAILED_TITLE.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
});

test.each(Object.values(ConnectionFailureReason))('the %s reason is short enough for a phone', (reason) => {
  expect(FAILURE_REASON_COPY[reason].length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
});

test.each([UNSYNCED_LOST_ON_RELOAD_DETAIL, UNSYNCED_LOST_ON_SIGN_IN_DETAIL])(
  'the unsynced warning "%s" is short enough for a phone',
  (detail) => {
    expect(detail.length).toBeLessThanOrEqual(MAX_DETAIL_LENGTH);
  },
);

test.each(Object.values(ConnectionFailureReason))('the %s reason and its warning fit one phone paragraph', (reason) => {
  const paragraph = `${FAILURE_REASON_COPY[reason]} ${unsyncedDetailFor(reason)}`;
  expect(paragraph.length).toBeLessThanOrEqual(MAX_PARAGRAPH_LENGTH);
});

test('the warning matches the button: reload for every reason but an ended session', () => {
  expect(unsyncedDetailFor(ConnectionFailureReason.SessionEnded)).toBe(UNSYNCED_LOST_ON_SIGN_IN_DETAIL);
  expect(unsyncedDetailFor(ConnectionFailureReason.Unknown)).toBe(UNSYNCED_LOST_ON_RELOAD_DETAIL);
});

test('a superseded tab is told to download, not to reload, and is offered the way back', () => {
  expect(unsyncedDetailFor(ConnectionFailureReason.Superseded)).toBe(SUPERSEDED_DOWNLOAD_DETAIL);
  expect(actionLabelFor(ConnectionFailureReason.Superseded)).toBe(BACK_TO_DOCUMENTS_LABEL);
  expect(actionLabelFor(ConnectionFailureReason.SessionEnded)).toBe(SIGN_IN_LABEL);
  expect(actionLabelFor(ConnectionFailureReason.Unknown)).toBe(RELOAD_LABEL);
});
