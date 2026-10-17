import { authorColorSlot, DocumentRole, type DocumentMember } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import type { SuperDoc } from 'superdoc';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AUTHOR_PALETTE, installAuthorPalette, removeAuthorPalette } from '@/testing/author-palette';
import { JumpOutcome, useMemberCursors } from './use-member-cursors';

const CARET_CLASS = 'v2-collaboration-overlay__remote-caret';
const LABEL_CLASS = 'v2-collaboration-overlay__remote-label';
const SELECTION_CLASS = 'v2-collaboration-overlay__remote-selection';
const GLOW_CLASS = 'member-glow';
const GLOW_MS = 1200;
const FORGED_COLOR = '#000000';
const superdoc = {} as SuperDoc;
const bruno: DocumentMember = { user: { id: 'u2', name: 'Bruno' }, role: DocumentRole.Editor, online: true };
const clara: DocumentMember = { user: { id: 'u3', name: 'Clara' }, role: DocumentRole.Editor, online: true };

function colorOf(member: DocumentMember): string {
  return AUTHOR_PALETTE[authorColorSlot(member.user.id) - 1]!;
}

function addCaret({ container, name, color }: { container: HTMLElement; name: string; color: string }) {
  const group = document.createElement('div');
  const caret = document.createElement('div');
  const label = document.createElement('div');
  const selection = document.createElement('div');
  caret.className = CARET_CLASS;
  caret.style.backgroundColor = color;
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
  installAuthorPalette();
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  removeAuthorPalette();
  container.remove();
  vi.useRealTimers();
});

function jump({ result, member }: { result: { current: ReturnType<typeof useMemberCursors> }; member: DocumentMember }): JumpOutcome {
  let outcome: JumpOutcome | undefined;
  act(() => {
    outcome = result.current.jumpTo(member);
  });
  return outcome!;
}

test('jumpTo scrolls the remote caret element whose label is the member name and colour into view', () => {
  const { caret } = addCaret({ container, name: 'Bruno', color: colorOf(bruno) });
  const other = addCaret({ container, name: 'Clara', color: colorOf(clara) });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(jump({ result, member: bruno })).toBe(JumpOutcome.Jumped);
  expect(caret.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center' });
  expect(other.caret.scrollIntoView).not.toHaveBeenCalled();
});

test('a member with no caret element returns NotFound', () => {
  addCaret({ container, name: 'Clara', color: colorOf(clara) });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(jump({ result, member: bruno })).toBe(JumpOutcome.NotFound);
});

test('a peer whose name equals the member name but whose colour differs does not satisfy the jump', () => {
  const forged = addCaret({ container, name: 'Bruno', color: FORGED_COLOR });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(result.current.hasCursor(bruno)).toBe(false);
  expect(jump({ result, member: bruno })).toBe(JumpOutcome.NotFound);
  expect(forged.caret.scrollIntoView).not.toHaveBeenCalled();
});

test('two carets with the same name and colour are ambiguous, so neither jump nor cursor is claimed', () => {
  addCaret({ container, name: 'Bruno', color: colorOf(bruno) });
  addCaret({ container, name: 'Bruno', color: colorOf(bruno) });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(result.current.hasCursor(bruno)).toBe(false);
  expect(jump({ result, member: bruno })).toBe(JumpOutcome.NotFound);
});

test('hasCursor follows carets appearing and leaving', async () => {
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(result.current.hasCursor(bruno)).toBe(false);
  let added: ReturnType<typeof addCaret> | undefined;
  await act(async () => {
    added = addCaret({ container, name: 'Bruno', color: colorOf(bruno) });
  });
  expect(result.current.hasCursor(bruno)).toBe(true);
  await act(async () => {
    added?.group.remove();
  });
  expect(result.current.hasCursor(bruno)).toBe(false);
});

test('without an instance no member has a cursor', () => {
  addCaret({ container, name: 'Bruno', color: colorOf(bruno) });
  const { result } = renderHook(() => useMemberCursors({ superdoc: null, container }));
  expect(result.current.hasCursor(bruno)).toBe(false);
});

test('jumpTo adds the glow class to the matching __remote-selection and removes it after CURSOR_GLOW_MS', () => {
  vi.useFakeTimers();
  const brunoParts = addCaret({ container, name: 'Bruno', color: colorOf(bruno) });
  const claraParts = addCaret({ container, name: 'Clara', color: colorOf(clara) });
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
