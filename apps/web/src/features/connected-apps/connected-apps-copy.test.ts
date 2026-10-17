import { expect, test } from 'vitest';
import { documentPrompts } from './connected-apps-copy';

const TITLE = 'Quarterly plan';

test('documentPrompts adds the fix prompt only when canEdit is true', () => {
  const readerPrompts = documentPrompts({ title: TITLE, canEdit: false });
  const editorPrompts = documentPrompts({ title: TITLE, canEdit: true });
  expect(readerPrompts).toHaveLength(2);
  expect(editorPrompts).toHaveLength(3);
  expect(editorPrompts.slice(0, 2)).toEqual(readerPrompts);
  expect(editorPrompts[2]).toContain('Fix');
  editorPrompts.forEach((prompt) => expect(prompt).toContain(TITLE));
});
