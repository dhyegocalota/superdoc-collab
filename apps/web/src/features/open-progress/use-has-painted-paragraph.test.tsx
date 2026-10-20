import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { useHasPaintedParagraph } from './use-has-painted-paragraph';

function pageWithFragment(): HTMLElement {
  const page = document.createElement('div');
  page.className = 'superdoc-page';
  const fragment = document.createElement('div');
  fragment.className = 'superdoc-fragment';
  page.append(fragment);
  return page;
}

test('no container means nothing is painted', () => {
  const { result } = renderHook(() => useHasPaintedParagraph(null));
  expect(result.current).toBe(false);
});

test('an empty container is not painted until a page holds a fragment', async () => {
  const container = document.createElement('div');
  const { result } = renderHook(() => useHasPaintedParagraph(container));
  expect(result.current).toBe(false);
  container.append(document.createElement('div'));
  await act(async () => Promise.resolve());
  expect(result.current).toBe(false);
  container.append(pageWithFragment());
  await act(async () => Promise.resolve());
  expect(result.current).toBe(true);
});

test('a container that already holds a fragment is painted at once', () => {
  const container = document.createElement('div');
  container.append(pageWithFragment());
  const { result } = renderHook(() => useHasPaintedParagraph(container));
  expect(result.current).toBe(true);
});

test('a new container starts unpainted again', () => {
  const painted = document.createElement('div');
  painted.append(pageWithFragment());
  const { result, rerender } = renderHook(({ container }) => useHasPaintedParagraph(container), { initialProps: { container: painted } });
  expect(result.current).toBe(true);
  rerender({ container: document.createElement('div') });
  expect(result.current).toBe(false);
});
