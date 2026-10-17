import { DocumentRole, type DocumentMember } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import type { SuperDoc } from 'superdoc';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { JumpOutcome, useMemberCursors } from './use-member-cursors';

const CARET_CLASS = 'v2-collaboration-overlay__remote-caret';
const LABEL_CLASS = 'v2-collaboration-overlay__remote-label';
const SELECTION_CLASS = 'v2-collaboration-overlay__remote-selection';
const GLOW_CLASS = 'member-glow';
const GLOW_MS = 1200;
const superdoc = {} as SuperDoc;
const bruno: DocumentMember = { user: { id: 'u2', name: 'Bruno' }, role: DocumentRole.Editor, online: true };

function addCaret({ container, name }: { container: HTMLElement; name: string }) {
  const group = document.createElement('div');
  const caret = document.createElement('div');
  const label = document.createElement('div');
  const selection = document.createElement('div');
  caret.className = CARET_CLASS;
  label.className = LABEL_CLASS;
  label.textContent = name;
  selection.className = SELECTION_CLASS;
  caret.append(label);
  group.append(caret, selection);
  container.append(group);
  caret.scrollIntoView = vi.fn();
  return { group, caret, selection };
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  container.remove();
  vi.useRealTimers();
});

test('jumpTo scrolls the remote caret element whose label is the member name into view', () => {
  const { caret } = addCaret({ container, name: 'Bruno' });
  const other = addCaret({ container, name: 'Clara' });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  let outcome: JumpOutcome | undefined;
  act(() => {
    outcome = result.current.jumpTo(bruno);
  });
  expect(caret.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center' });
  expect(other.caret.scrollIntoView).not.toHaveBeenCalled();
  expect(outcome).toBe(JumpOutcome.Jumped);
});

test('a member with no caret element returns NotFound', () => {
  addCaret({ container, name: 'Clara' });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  let outcome: JumpOutcome | undefined;
  act(() => {
    outcome = result.current.jumpTo(bruno);
  });
  expect(outcome).toBe(JumpOutcome.NotFound);
});

test('namesWithCursor follows carets appearing and leaving', async () => {
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect([...result.current.namesWithCursor]).toEqual([]);
  let added: ReturnType<typeof addCaret> | undefined;
  await act(async () => {
    added = addCaret({ container, name: 'Bruno' });
  });
  expect([...result.current.namesWithCursor]).toEqual(['Bruno']);
  await act(async () => {
    added?.group.remove();
  });
  expect([...result.current.namesWithCursor]).toEqual([]);
});

test('without an instance no member has a cursor', () => {
  addCaret({ container, name: 'Bruno' });
  const { result } = renderHook(() => useMemberCursors({ superdoc: null, container }));
  expect([...result.current.namesWithCursor]).toEqual([]);
});

test('jumpTo adds the glow class to the matching __remote-selection and removes it after CURSOR_GLOW_MS', () => {
  vi.useFakeTimers();
  const brunoParts = addCaret({ container, name: 'Bruno' });
  const claraParts = addCaret({ container, name: 'Clara' });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  act(() => {
    result.current.jumpTo(bruno);
  });
  expect(brunoParts.selection.classList.contains(GLOW_CLASS)).toBe(true);
  expect(claraParts.selection.classList.contains(GLOW_CLASS)).toBe(false);
  act(() => {
    vi.advanceTimersByTime(GLOW_MS - 1);
  });
  expect(brunoParts.selection.classList.contains(GLOW_CLASS)).toBe(true);
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(brunoParts.selection.classList.contains(GLOW_CLASS)).toBe(false);
});
