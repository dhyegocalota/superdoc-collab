import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { REDUCED_MOTION_QUERY } from '@/lib/use-reduced-motion';
import { useWordReveal, WORD_REVEAL_INTERVAL_MS } from './use-word-reveal';

const SENTENCE = 'Ana raised the budget.';
const BEGINNING = 'Ana raised';

function stubReducedMotion(prefersReducedMotion: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === REDUCED_MOTION_QUERY && prefersReducedMotion,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function revealing(props: { text: string; isStreaming: boolean }) {
  return renderHook((hookProps: { text: string; isStreaming: boolean }) => useWordReveal(hookProps), { initialProps: props });
}

function advanceWords(count: number): void {
  act(() => vi.advanceTimersByTime(WORD_REVEAL_INTERVAL_MS * count));
}

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('a streamed sentence appears one word per interval', () => {
  const { result } = revealing({ text: SENTENCE, isStreaming: true });
  expect(result.current).toBe('');
  advanceWords(1);
  expect(result.current).toBe('Ana');
  advanceWords(1);
  expect(result.current).toBe(BEGINNING);
});

test('more words arriving continue from the words already shown', () => {
  const { result, rerender } = revealing({ text: BEGINNING, isStreaming: true });
  advanceWords(2);
  expect(result.current).toBe(BEGINNING);
  rerender({ text: SENTENCE, isStreaming: true });
  expect(result.current).toBe(BEGINNING);
  advanceWords(1);
  expect(result.current).toBe('Ana raised the');
});

test('the final sentence continues the partial without a jump', () => {
  const { result, rerender } = revealing({ text: BEGINNING, isStreaming: true });
  advanceWords(2);
  rerender({ text: SENTENCE, isStreaming: false });
  expect(result.current).toBe(BEGINNING);
  advanceWords(2);
  expect(result.current).toBe(SENTENCE);
});

test('a sentence that was there before any stream shows whole, and so does a different one', () => {
  const { result, rerender } = revealing({ text: SENTENCE, isStreaming: false });
  expect(result.current).toBe(SENTENCE);
  rerender({ text: 'Bruno hired a designer.', isStreaming: false });
  expect(result.current).toBe('Bruno hired a designer.');
});

test('reduced motion shows the streamed sentence at once', () => {
  stubReducedMotion(true);
  const { result, rerender } = revealing({ text: BEGINNING, isStreaming: true });
  expect(result.current).toBe(BEGINNING);
  rerender({ text: SENTENCE, isStreaming: true });
  expect(result.current).toBe(SENTENCE);
});
