import { expect, test } from 'vitest';
import { SUMMARIZE_BUSY_MESSAGE } from './timeline';

test('the summarize busy message is one sentence', () => {
  expect(SUMMARIZE_BUSY_MESSAGE).toMatch(/^[^.]+\.(\s[^.]+\.)?$/);
});
