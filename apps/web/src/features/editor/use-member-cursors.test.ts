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

function createOverlay(parent: HTMLElement): HTMLElement {
  const overlay = document.createElement('div');
  overlay.dataset.v2CollaborationOverlay = 'true';
  parent.append(overlay);
  return overlay;
}

let nextRank = 1;

function addCaret({ overlay, name, color }: { overlay: HTMLElement; name: string; color: string }) {
  const rank = String(nextRank++);
  const caret = document.createElement('div');
  const label = document.createElement('div');
  const selection = document.createElement('div');
  caret.className = CARET_CLASS;
  caret.dataset.peerRank = rank;
  caret.style.backgroundColor = color;
  label.className = LABEL_CLASS;
  label.textContent = name;
  selection.className = SELECTION_CLASS;
  selection.dataset.peerRank = rank;
  caret.append(label);
  overlay.append(caret, selection);
  caret.scrollIntoView = vi.fn();
  return { caret, selection };
}

let container: HTMLElement;
let overlay: HTMLElement;

beforeEach(() => {
  installAuthorPalette();
  container = document.createElement('div');
  document.body.append(container);
  overlay = createOverlay(container);
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
  const { caret } = addCaret({ overlay, name: 'Bruno', color: colorOf(bruno) });
  const other = addCaret({ overlay, name: 'Clara', color: colorOf(clara) });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(jump({ result, member: bruno })).toBe(JumpOutcome.Jumped);
  expect(caret.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center' });
  expect(other.caret.scrollIntoView).not.toHaveBeenCalled();
});

test('a member with no caret element returns NotFound', () => {
  addCaret({ overlay, name: 'Clara', color: colorOf(clara) });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(jump({ result, member: bruno })).toBe(JumpOutcome.NotFound);
});

test('a peer whose name equals the member name but whose colour differs does not satisfy the jump', () => {
  const forged = addCaret({ overlay, name: 'Bruno', color: FORGED_COLOR });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(result.current.hasCursor(bruno)).toBe(false);
  expect(jump({ result, member: bruno })).toBe(JumpOutcome.NotFound);
  expect(forged.caret.scrollIntoView).not.toHaveBeenCalled();
});

test('two carets with the same name and colour are ambiguous, so neither jump nor cursor is claimed', () => {
  addCaret({ overlay, name: 'Bruno', color: colorOf(bruno) });
  addCaret({ overlay, name: 'Bruno', color: colorOf(bruno) });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(result.current.hasCursor(bruno)).toBe(false);
  expect(jump({ result, member: bruno })).toBe(JumpOutcome.NotFound);
});

test('hasCursor follows carets appearing and leaving', async () => {
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  expect(result.current.hasCursor(bruno)).toBe(false);
  let added: ReturnType<typeof addCaret> | undefined;
  await act(async () => {
    added = addCaret({ overlay, name: 'Bruno', color: colorOf(bruno) });
  });
  expect(result.current.hasCursor(bruno)).toBe(true);
  await act(async () => {
    added?.caret.remove();
    added?.selection.remove();
  });
  expect(result.current.hasCursor(bruno)).toBe(false);
});

test('without an instance no member has a cursor', () => {
  addCaret({ overlay, name: 'Bruno', color: colorOf(bruno) });
  const { result } = renderHook(() => useMemberCursors({ superdoc: null, container }));
  expect(result.current.hasCursor(bruno)).toBe(false);
});

test('jumpTo adds the glow class to the matching __remote-selection and removes it after CURSOR_GLOW_MS', () => {
  vi.useFakeTimers();
  const brunoParts = addCaret({ overlay, name: 'Bruno', color: colorOf(bruno) });
  const claraParts = addCaret({ overlay, name: 'Clara', color: colorOf(clara) });
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

test('the glow goes only to the selection that shares the caret peer rank', () => {
  vi.useFakeTimers();
  const brunoParts = addCaret({ overlay, name: 'Bruno', color: colorOf(bruno) });
  const claraParts = addCaret({ overlay, name: 'Clara', color: colorOf(clara) });
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  act(() => {
    result.current.jumpTo(clara);
  });
  expect(claraParts.selection.classList.contains(GLOW_CLASS)).toBe(true);
  expect(brunoParts.selection.classList.contains(GLOW_CLASS)).toBe(false);
});

test('it observes the overlay layer and never the whole editor container once the overlay exists', () => {
  const observe = vi.spyOn(MutationObserver.prototype, 'observe');
  renderHook(() => useMemberCursors({ superdoc, container }));
  expect(observe.mock.calls.filter(([, options]) => options?.subtree === true).map(([target]) => target)).toEqual([overlay]);
  observe.mockRestore();
});

test('an overlay that appears after mount is picked up', async () => {
  overlay.remove();
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  await act(async () => {
    addCaret({ overlay: createOverlay(container), name: 'Bruno', color: colorOf(bruno) });
  });
  expect(result.current.hasCursor(bruno)).toBe(true);
});

test('many distinct caret colours never add a colour normalisation beyond the six palette colours', () => {
  const createElement = vi.spyOn(document, 'createElement');
  Array.from({ length: 50 }, (_, index) =>
    addCaret({ overlay, name: `Peer ${index}`, color: `#${index.toString(16).padStart(2, '0')}0000` }),
  );
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  [bruno, clara].forEach(result.current.hasCursor);
  const probes = createElement.mock.calls.filter(([tag]) => tag === 'span');
  createElement.mockRestore();
  expect(probes.length).toBeLessThanOrEqual(AUTHOR_PALETTE.length);
});

test('a replaced overlay node is watched in place of the old one', async () => {
  const { result } = renderHook(() => useMemberCursors({ superdoc, container }));
  const replacement = document.createElement('div');
  replacement.dataset.v2CollaborationOverlay = 'true';
  await act(async () => {
    overlay.replaceWith(replacement);
  });
  await act(async () => {
    addCaret({ overlay: replacement, name: 'Bruno', color: colorOf(bruno) });
  });
  expect(result.current.hasCursor(bruno)).toBe(true);
});
