import { HISTORY_CATCHING_UP_MESSAGE, HttpStatus } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { requestFailedMessage } from '@/lib/api';
import {
  bandAriaLabel,
  CLEAR_SELECTION_LABEL,
  editDeltaLabel,
  EditUnit,
  importedAuthorLabel,
  liveEditsLabel,
  LOADING_TIMELINE_LABEL,
  noEditsForLabel,
  PANEL_POSITION_LABELS,
  SHOWING_WHOLE_DOCUMENT_MESSAGE,
  streamgraphDescription,
  VIEW_VERSION_LABEL,
} from './timeline-copy';
import { PanelPosition } from './use-panel-position';

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

test('an imported author names the DOCX and each panel position has a label', () => {
  expect(importedAuthorLabel('Chris Crawford')).toBe('Chris Crawford, imported from the DOCX');
  expect(Object.values(PanelPosition).map((position) => PANEL_POSITION_LABELS[position])).toEqual(['Bottom', 'Side']);
});

test('the selected header copy reads the whole document, names the version button', () => {
  expect(SHOWING_WHOLE_DOCUMENT_MESSAGE).toBe('Showing the whole document');
  expect(CLEAR_SELECTION_LABEL).toBe('Clear selection');
  expect(VIEW_VERSION_LABEL).toBe('View version');
  expect(LOADING_TIMELINE_LABEL).toBe('Loading the timeline');
});

test('a break names how long there were no edits', () => {
  expect(noEditsForLabel({ duration: '7 minutes' })).toBe('No edits for 7 minutes');
});

test('the description says long stretches are shortened only when the chart has a break', () => {
  const plain = streamgraphDescription({ bandCount: 3, from: 'a', to: 'b', hasIdleBreaks: false });
  const shortened = streamgraphDescription({ bandCount: 3, from: 'a', to: 'b', hasIdleBreaks: true });
  expect(plain).toBe('3 bands, from a to b');
  expect(shortened.startsWith(plain)).toBe(true);
  expect(shortened.endsWith('Long stretches without edits are shortened.')).toBe(true);
});

test('the live cue counts the new edits and agrees with one', () => {
  expect(liveEditsLabel(1)).toBe('1 new edit');
  expect(liveEditsLabel(4)).toBe('4 new edits');
});
