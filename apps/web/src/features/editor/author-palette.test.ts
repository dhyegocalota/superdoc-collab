import { expect, test, vi } from 'vitest';
import { installAuthorPalette } from '@/testing/author-palette';
import { authorColorOf } from './author-palette';

test('the six author tokens are read from the document once, however often a colour is asked for', () => {
  installAuthorPalette();
  const computedStyle = vi.spyOn(window, 'getComputedStyle');
  [1, 2, 1, 6, 3].forEach(authorColorOf);
  expect(computedStyle).toHaveBeenCalledTimes(1);
});
