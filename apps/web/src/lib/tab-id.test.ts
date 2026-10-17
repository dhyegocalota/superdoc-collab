import { expect, test } from 'vitest';
import { tabId } from './tab-id';

test('tabId returns the same id within a page load', () => {
  expect(tabId()).toBe(tabId());
  expect(tabId()).not.toBe('');
});
