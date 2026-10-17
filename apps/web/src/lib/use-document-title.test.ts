import { renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { APP_NAME } from './app-copy';
import { pageTitle, useDocumentTitle } from './use-document-title';

const PAGE_NAME = 'Plan';

test('a page title is followed by the app name and the app name comes back on unmount', () => {
  const { unmount } = renderHook(() => useDocumentTitle(PAGE_NAME));
  expect(document.title).toBe(pageTitle(PAGE_NAME));
  expect(document.title).toBe(`${PAGE_NAME} · ${APP_NAME}`);
  unmount();
  expect(document.title).toBe(APP_NAME);
});

test('a page without a title yet shows the app name alone', () => {
  renderHook(() => useDocumentTitle(null));
  expect(document.title).toBe(APP_NAME);
});
