import type { EditRunView } from '@superdoc-history/types';
import { renderHook } from '@testing-library/react';
import type { SuperDoc } from 'superdoc';
import { beforeEach, expect, test, vi } from 'vitest';
import { clearHighlights, highlightEdits, type EditorDocument } from '@/features/editor/highlight-edits';
import { useRunHighlights } from './use-run-highlights';

vi.mock('@/features/editor/highlight-edits', () => ({ highlightEdits: vi.fn(), clearHighlights: vi.fn() }));

const document = {} as EditorDocument;
const superdoc = { activeEditor: { doc: document } } as unknown as SuperDoc;
const FIRST_RUNS: EditRunView[] = [{ blockId: 'b1', bandId: 'band-0', authorKeys: ['ana'], inserted: 'first edit', deleted: '', lastServerTime: 1 }];
const SECOND_RUNS: EditRunView[] = [{ blockId: 'b2', bandId: 'band-0', authorKeys: ['ana'], inserted: 'second edit', deleted: '', lastServerTime: 2 }];

beforeEach(() => {
  vi.mocked(highlightEdits).mockReset();
  vi.mocked(clearHighlights).mockReset();
  vi.mocked(highlightEdits).mockImplementation(async ({ runs }) => ({ commentIds: runs.map((run) => `id-${run.blockId}`), skippedCount: 0 }));
});

test('nothing happens before the viewer is ready', () => {
  renderHook(() => useRunHighlights({ superdoc: null, runs: FIRST_RUNS }));
  expect(highlightEdits).not.toHaveBeenCalled();
});

test('a new set replaces the previous one wholesale', async () => {
  const { rerender } = renderHook(({ runs }) => useRunHighlights({ superdoc, runs }), { initialProps: { runs: FIRST_RUNS } });
  await vi.waitFor(() => expect(highlightEdits).toHaveBeenCalledTimes(1));
  await Promise.resolve();
  rerender({ runs: SECOND_RUNS });
  expect(clearHighlights).toHaveBeenCalledWith({ document, commentIds: ['id-b1'] });
  await vi.waitFor(() => expect(highlightEdits).toHaveBeenCalledTimes(2));
  expect(vi.mocked(clearHighlights).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(highlightEdits).mock.invocationCallOrder[1]!);
});

test('an empty set clears the highlights and unmounting removes them', async () => {
  const { rerender, unmount } = renderHook(({ runs }) => useRunHighlights({ superdoc, runs }), { initialProps: { runs: FIRST_RUNS } });
  await vi.waitFor(() => expect(highlightEdits).toHaveBeenCalledTimes(1));
  await Promise.resolve();
  rerender({ runs: [] });
  expect(clearHighlights).toHaveBeenCalledWith({ document, commentIds: ['id-b1'] });
  unmount();
  expect(clearHighlights).toHaveBeenCalledTimes(2);
});
