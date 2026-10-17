import type { EditRunView } from '@superdoc-collab/types';
import { renderHook } from '@testing-library/react';
import type { SuperDoc } from 'superdoc';
import { beforeEach, expect, test, vi } from 'vitest';
import { clearHighlights, highlightEdits, type EditorDocument, type HighlightResult } from '@/features/editor/highlight-edits';
import { useRunHighlights } from './use-run-highlights';

vi.mock('@/features/editor/highlight-edits', () => ({ highlightEdits: vi.fn(), clearHighlights: vi.fn() }));

const document = {} as EditorDocument;
const FIRST_RUNS: EditRunView[] = [
  { blockId: 'b1', bandId: 'band-0', authorKeys: ['ana'], inserted: 'first edit', deleted: '', lastServerTime: 1 },
];
const SECOND_RUNS: EditRunView[] = [
  { blockId: 'b2', bandId: 'band-0', authorKeys: ['ana'], inserted: 'second edit', deleted: '', lastServerTime: 2 },
];
const ALL_SKIPPED: HighlightResult = { commentIds: [], skippedCount: 1, targetCount: 1 };

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function resultFor(runs: EditRunView[]): HighlightResult {
  return { commentIds: runs.map((run) => `id-${run.blockId}`), skippedCount: 0, targetCount: runs.length };
}

function stubSuperdoc() {
  const listeners: (() => void)[] = [];
  const on = vi.fn((_event: string, listener: () => void) => listeners.push(listener));
  const off = vi.fn();
  const superdoc = { activeEditor: { doc: document }, on, off } as unknown as SuperDoc;
  return { superdoc, on, off, listeners };
}

beforeEach(() => {
  vi.mocked(highlightEdits).mockReset();
  vi.mocked(clearHighlights).mockReset();
  vi.mocked(highlightEdits).mockImplementation(async ({ runs }) => resultFor(runs));
});

test('nothing happens before the viewer is ready', () => {
  renderHook(() => useRunHighlights({ superdoc: null, runs: FIRST_RUNS }));
  expect(highlightEdits).not.toHaveBeenCalled();
});

test('a new set replaces the previous one wholesale', async () => {
  const { superdoc } = stubSuperdoc();
  const { rerender } = renderHook(({ runs }) => useRunHighlights({ superdoc, runs }), { initialProps: { runs: FIRST_RUNS } });
  await vi.waitFor(() => expect(highlightEdits).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(vi.mocked(highlightEdits).mock.results[0]!.value).resolves.toBeDefined());
  rerender({ runs: SECOND_RUNS });
  expect(clearHighlights).toHaveBeenCalledWith({ document, commentIds: ['id-b1'] });
  await vi.waitFor(() => expect(highlightEdits).toHaveBeenCalledTimes(2));
});

test('a set that resolves after the runs changed is deleted and the new one is kept', async () => {
  const { superdoc } = stubSuperdoc();
  const first = deferred<HighlightResult>();
  vi.mocked(highlightEdits).mockImplementationOnce(() => first.promise);
  const { rerender } = renderHook(({ runs }) => useRunHighlights({ superdoc, runs }), { initialProps: { runs: FIRST_RUNS } });
  rerender({ runs: SECOND_RUNS });
  await vi.waitFor(() => expect(highlightEdits).toHaveBeenCalledTimes(2));
  first.resolve({ commentIds: ['stale'], skippedCount: 0, targetCount: 1 });
  await vi.waitFor(() => expect(clearHighlights).toHaveBeenCalledWith({ document, commentIds: ['stale'] }));
  expect(clearHighlights).not.toHaveBeenCalledWith({ document, commentIds: ['id-b2'] });
});

test('an empty set clears the highlights and unmounting removes them', async () => {
  const { superdoc } = stubSuperdoc();
  const { rerender, unmount } = renderHook(({ runs }) => useRunHighlights({ superdoc, runs }), { initialProps: { runs: FIRST_RUNS } });
  await vi.waitFor(() => expect(highlightEdits).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(vi.mocked(highlightEdits).mock.results[0]!.value).resolves.toBeDefined());
  rerender({ runs: [] });
  expect(clearHighlights).toHaveBeenCalledWith({ document, commentIds: ['id-b1'] });
  unmount();
  expect(clearHighlights).toHaveBeenCalledTimes(2);
});

test('when every target was skipped it retries once on the next content update', async () => {
  const { superdoc, on, off, listeners } = stubSuperdoc();
  vi.mocked(highlightEdits).mockResolvedValueOnce(ALL_SKIPPED).mockResolvedValue(ALL_SKIPPED);
  renderHook(() => useRunHighlights({ superdoc, runs: FIRST_RUNS }));
  await vi.waitFor(() => expect(on).toHaveBeenCalledTimes(1));
  listeners[0]!();
  expect(off).toHaveBeenCalledWith('editor-update', listeners[0]);
  await vi.waitFor(() => expect(highlightEdits).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(vi.mocked(highlightEdits).mock.results[1]!.value).resolves.toBeDefined());
  expect(on).toHaveBeenCalledTimes(1);
});

test('a partial match does not wait for another update and unmounting unsubscribes a pending retry', async () => {
  const partial = stubSuperdoc();
  vi.mocked(highlightEdits).mockResolvedValueOnce({ commentIds: ['x'], skippedCount: 1, targetCount: 2 });
  renderHook(() => useRunHighlights({ superdoc: partial.superdoc, runs: FIRST_RUNS }));
  await vi.waitFor(() => expect(highlightEdits).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(vi.mocked(highlightEdits).mock.results[0]!.value).resolves.toBeDefined());
  expect(partial.on).not.toHaveBeenCalled();
  const pending = stubSuperdoc();
  vi.mocked(highlightEdits).mockResolvedValueOnce(ALL_SKIPPED);
  const { unmount } = renderHook(() => useRunHighlights({ superdoc: pending.superdoc, runs: FIRST_RUNS }));
  await vi.waitFor(() => expect(pending.on).toHaveBeenCalledTimes(1));
  unmount();
  expect(pending.off).toHaveBeenCalledWith('editor-update', pending.listeners[0]);
});

test('a failing highlight is handled without leaking an unhandled rejection', async () => {
  const { superdoc } = stubSuperdoc();
  vi.mocked(highlightEdits).mockRejectedValue(new Error('engine failed'));
  renderHook(() => useRunHighlights({ superdoc, runs: FIRST_RUNS }));
  await vi.waitFor(() => expect(clearHighlights).toHaveBeenCalledWith({ document, commentIds: [] }));
});
