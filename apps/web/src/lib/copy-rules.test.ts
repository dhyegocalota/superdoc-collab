import * as types from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import * as authCopy from '@/features/auth/auth-copy';
import * as documentsCopy from '@/features/documents/documents-copy';
import * as editorCopy from '@/features/editor/editor-copy';
import * as timelineCopy from '@/features/timeline/timeline-copy';
import * as appCopy from './app-copy';

const THREE_DOTS = '...';
const PERIOD = '.';
const COPY_MODULES: Record<string, unknown>[] = [authCopy, documentsCopy, editorCopy, timelineCopy, appCopy, types];
const SENTENCES = [
  types.INVALID_SHARE_LINK_MESSAGE,
  types.DOCUMENT_UNAVAILABLE_MESSAGE,
  types.HISTORY_CATCHING_UP_MESSAGE,
  types.NO_MATCHING_EDITS_MESSAGE,
  timelineCopy.SUMMARY_UP_TO_DATE_MESSAGE,
];

function copyStrings(module: Record<string, unknown>): string[] {
  return Object.values(module).filter((value): value is string => typeof value === 'string');
}

test('no copy writes an ellipsis as three dots', () => {
  expect(COPY_MODULES.flatMap(copyStrings).filter((text) => text.includes(THREE_DOTS))).toEqual([]);
});

test.each(SENTENCES)('the sentence "%s" ends with a period', (sentence) => {
  expect(sentence.endsWith(PERIOD)).toBe(true);
});
