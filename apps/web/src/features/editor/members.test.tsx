import { DocumentRole, MEMBERS_PRESENCE_DEBOUNCE_MS, type AuthorColorSlot, type DocumentMember } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SuperDoc } from 'superdoc';
import { PHONE_VIEWPORT_WIDTH, stubViewportWidth, WIDE_VIEWPORT_WIDTH } from '@/testing/viewport';
import { AUTHOR_PALETTE, installAuthorPalette, removeAuthorPalette } from '@/testing/author-palette';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  BACK_TO_LIVE_TO_JUMP_REASON,
  cursorNotFoundMessage,
  goToCursorLabel,
  memberLabel,
  moreMembersLabel,
  movedToCursorMessage,
  cursorOffScreenReason,
  offlineMemberReason,
  SELF_MEMBER_REASON,
} from './editor-copy';
import { initialsOf } from '@/lib/initials';
import { membersQueryKey } from './editor-api';
import { Members } from './members';

const CURRENT_USER_ID = 'u1';
const DOCUMENT_ID = 'doc-1';
const JUMP_FAILED_MS = 3000;
const AWARENESS_UPDATE_EVENT = 'awareness-update';

type AwarenessChange = { added: number[]; removed: number[] };

let superdoc: SuperDoc;
let awarenessHandlers: Set<(change: AwarenessChange) => void>;

function emitAwareness(change: AwarenessChange): void {
  awarenessHandlers.forEach((handler) => handler(change));
}

function superdocWithAwareness(): SuperDoc {
  awarenessHandlers = new Set();
  return {
    on: (name: string, handler: (change: AwarenessChange) => void) => {
      if (name === AWARENESS_UPDATE_EVENT) awarenessHandlers.add(handler);
    },
    off: (name: string, handler: (change: AwarenessChange) => void) => {
      if (name === AWARENESS_UPDATE_EVENT) awarenessHandlers.delete(handler);
    },
  } as unknown as SuperDoc;
}
const scrollIntoView = vi.fn();

function memberNamed({
  id,
  name,
  online,
  colorSlot,
}: {
  id: string;
  name: string;
  online: boolean;
  colorSlot: AuthorColorSlot;
}): DocumentMember {
  return { user: { id, name }, role: DocumentRole.Editor, online, colorSlot };
}

const ana = memberNamed({ id: CURRENT_USER_ID, name: 'Ana', online: true, colorSlot: 1 });
const bruno = memberNamed({ id: 'u2', name: 'Bruno', online: true, colorSlot: 4 });
const clara = memberNamed({ id: 'u3', name: 'Clara', online: false, colorSlot: 5 });
const dario = memberNamed({ id: 'u4', name: 'Dario', online: true, colorSlot: 6 });

let queryClient: QueryClient;
let editor: HTMLElement;
let overlay: HTMLElement;

function colorOf(member: DocumentMember): string {
  return AUTHOR_PALETTE[member.colorSlot - 1]!;
}

function addCaret({ name, color }: { name: string; color: string }): void {
  const caret = document.createElement('div');
  const label = document.createElement('div');
  caret.style.backgroundColor = color;
  caret.className = 'v2-collaboration-overlay__remote-caret';
  label.className = 'v2-collaboration-overlay__remote-label';
  label.textContent = name;
  caret.append(label);
  caret.scrollIntoView = scrollIntoView;
  overlay.append(caret);
}

function renderMembers({ members, isPastVersion = false }: { members: DocumentMember[]; isPastVersion?: boolean }) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Members
        documentId={DOCUMENT_ID}
        members={members}
        currentUserId={CURRENT_USER_ID}
        superdoc={superdoc}
        editorContainer={editor}
        isPastVersion={isPastVersion}
      />
    </QueryClientProvider>,
  );
}

async function findJumpButton(name: string): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name: memberLabel({ name, isOnline: true }) });
  await waitFor(() => expect(button).toHaveAccessibleDescription(goToCursorLabel(name)));
  return button;
}

function manyMembers(count: number): DocumentMember[] {
  return Array.from({ length: count }, (_, index) =>
    memberNamed({ id: `m${index}`, name: `Person ${index}`, online: false, colorSlot: 1 }),
  );
}

beforeEach(() => {
  superdoc = superdocWithAwareness();
  queryClient = new QueryClient();
  stubViewportWidth(WIDE_VIEWPORT_WIDTH);
  installAuthorPalette();
  editor = document.createElement('div');
  overlay = document.createElement('div');
  overlay.dataset.v2CollaborationOverlay = 'true';
  editor.append(overlay);
  document.body.append(editor);
});

afterEach(() => {
  removeAuthorPalette();
  editor.remove();
  scrollIntoView.mockClear();
  vi.useRealTimers();
});

test('the avatar swatch of a member uses the slot the server assigned, not the id hash', () => {
  renderMembers({ members: [ana, bruno] });
  expect(screen.getByText(initialsOf('Bruno'))).toHaveClass('bg-author-4');
  expect(screen.getByText(initialsOf('Ana'))).toHaveClass('bg-author-1');
});

test('a peer with no rendered caret leaving refreshes the members query', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  renderMembers({ members: [ana, bruno] });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  act(() => emitAwareness({ added: [], removed: [1] }));
  await act(async () => {
    vi.advanceTimersByTime(MEMBERS_PRESENCE_DEBOUNCE_MS);
  });
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: membersQueryKey(DOCUMENT_ID) }, { cancelRefetch: false });
});

test('a peer who reconnects without a caret is refreshed on arrival and again on leave', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  renderMembers({ members: [ana, bruno] });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  act(() => emitAwareness({ added: [2], removed: [1] }));
  await act(async () => {
    vi.advanceTimersByTime(MEMBERS_PRESENCE_DEBOUNCE_MS);
  });
  act(() => emitAwareness({ added: [], removed: [2] }));
  await act(async () => {
    vi.advanceTimersByTime(MEMBERS_PRESENCE_DEBOUNCE_MS);
  });
  expect(invalidate).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: memberLabel({ name: 'Bruno', isOnline: true }) })).toBeInTheDocument();
});

test('a peer arriving refreshes the members query', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  renderMembers({ members: [ana, bruno] });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  act(() => emitAwareness({ added: [1], removed: [] }));
  await act(async () => {
    vi.advanceTimersByTime(MEMBERS_PRESENCE_DEBOUNCE_MS);
  });
  expect(invalidate).toHaveBeenCalledTimes(1);
});

test('an awareness update where nobody came or went leaves the members query alone', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  renderMembers({ members: [ana, bruno] });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  act(() => emitAwareness({ added: [], removed: [] }));
  await act(async () => {
    vi.advanceTimersByTime(MEMBERS_PRESENCE_DEBOUNCE_MS);
  });
  expect(invalidate).not.toHaveBeenCalled();
});

function MembersFetchProbe({ fetchMembers }: { fetchMembers: () => Promise<never> }) {
  useQuery({ queryKey: membersQueryKey(DOCUMENT_ID), queryFn: fetchMembers });
  return null;
}

test('a burst of presence changes during a members fetch invalidates once without cancelling it', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchMembers = vi.fn(() => new Promise<never>(() => {}));
  const dario = memberNamed({ id: 'u4', name: 'Dario', online: true, colorSlot: 6 });
  render(
    <QueryClientProvider client={queryClient}>
      <MembersFetchProbe fetchMembers={fetchMembers} />
      <Members
        documentId={DOCUMENT_ID}
        members={[ana, bruno, dario]}
        currentUserId={CURRENT_USER_ID}
        superdoc={superdoc}
        editorContainer={editor}
        isPastVersion={false}
      />
    </QueryClientProvider>,
  );
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  Array.from({ length: 5 }).forEach((_, index) =>
    act(() => emitAwareness(index % 2 === 0 ? { added: [1], removed: [] } : { added: [], removed: [1] })),
  );
  await act(async () => {
    vi.advanceTimersByTime(MEMBERS_PRESENCE_DEBOUNCE_MS);
  });
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: membersQueryKey(DOCUMENT_ID) }, { cancelRefetch: false });
  expect(fetchMembers).toHaveBeenCalledTimes(1);
});

test('a member with a live position is named Bruno, online and described by Go to Bruno’s cursor', async () => {
  addCaret({ name: 'Bruno', color: colorOf(bruno) });
  renderMembers({ members: [ana, bruno] });
  const button = await findJumpButton('Bruno');
  expect(button).not.toHaveAttribute('aria-disabled', 'true');
});

test('an online member with no position, an offline member and the current user are aria-disabled with their reason', async () => {
  renderMembers({ members: [ana, bruno, clara] });
  const user = userEvent.setup();
  const reasons = [
    { member: ana, reason: SELF_MEMBER_REASON, isOnline: true },
    { member: bruno, reason: cursorOffScreenReason('Bruno'), isOnline: true },
    { member: clara, reason: offlineMemberReason('Clara'), isOnline: false },
  ];
  for (const { member, reason, isOnline } of reasons) {
    const button = screen.getByRole('button', { name: memberLabel({ name: member.user.name, isOnline }) });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(reason);
  }
});

test('while a past version is shown every member is aria-disabled with Go back to live to jump to a cursor', async () => {
  addCaret({ name: 'Bruno', color: colorOf(bruno) });
  renderMembers({ members: [ana, bruno], isPastVersion: true });
  const buttons = screen.getAllByRole('button');
  expect(buttons.map((button) => button.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
  await userEvent.setup().tab();
  expect(await screen.findByRole('tooltip')).toHaveTextContent(BACK_TO_LIVE_TO_JUMP_REASON);
});

test('with five members there is no +N menu, and with six there are four avatars and a button named 2 more people', () => {
  const { unmount } = renderMembers({ members: manyMembers(5) });
  expect(screen.getAllByRole('button')).toHaveLength(5);
  expect(screen.queryByRole('button', { name: /more people/ })).not.toBeInTheDocument();
  unmount();
  renderMembers({ members: manyMembers(6) });
  expect(screen.getAllByRole('button')).toHaveLength(5);
  expect(screen.getByRole('button', { name: moreMembersLabel(2) })).toBeInTheDocument();
});

test('with seven members it shows four avatars and a button named 3 more people whose menu lists the rest', async () => {
  renderMembers({ members: manyMembers(7) });
  const triggers = screen.getAllByRole('button');
  expect(triggers).toHaveLength(5);
  await userEvent.click(screen.getByRole('button', { name: moreMembersLabel(3) }));
  const menu = await screen.findByRole('menu');
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent),
  ).toEqual([expect.stringContaining('Person 4'), expect.stringContaining('Person 5'), expect.stringContaining('Person 6')]);
});

test('the +N menu items for members who cannot be jumped to are aria-disabled with their reasons', async () => {
  addCaret({ name: 'Dario', color: colorOf(dario) });
  const members = [
    ana,
    bruno,
    clara,
    memberNamed({ id: 'u9', name: 'Eva', online: true, colorSlot: 2 }),
    dario,
    memberNamed({ id: 'u8', name: 'Fabio', online: true, colorSlot: 3 }),
  ];
  renderMembers({ members });
  await userEvent.click(screen.getByRole('button', { name: moreMembersLabel(2) }));
  const menu = await screen.findByRole('menu');
  const darioItem = within(menu).getByRole('menuitem', { name: /Dario/ });
  const fabio = within(menu).getByRole('menuitem', { name: /Fabio/ });
  expect(darioItem).not.toHaveAttribute('aria-disabled', 'true');
  expect(fabio).toHaveAttribute('aria-disabled', 'true');
  expect(fabio).toHaveTextContent(cursorOffScreenReason('Fabio'));
});

test('after a jump a status region reads Moved to Bruno’s cursor.', async () => {
  addCaret({ name: 'Bruno', color: colorOf(bruno) });
  renderMembers({ members: [ana, bruno] });
  const button = await findJumpButton('Bruno');
  await userEvent.click(button);
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center' });
  expect(screen.getByRole('status')).toHaveTextContent(movedToCursorMessage('Bruno'));
  expect(button).toHaveFocus();
});

test('a jump whose caret left shows the not-found message in the tooltip for three seconds', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  addCaret({ name: 'Bruno', color: colorOf(bruno) });
  renderMembers({ members: [ana, bruno] });
  const button = await findJumpButton('Bruno');
  editor.replaceChildren();
  await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(button);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(cursorNotFoundMessage('Bruno'));
  await act(async () => {
    vi.advanceTimersByTime(JUMP_FAILED_MS);
  });
  expect(screen.getByRole('tooltip')).not.toHaveTextContent(cursorNotFoundMessage('Bruno'));
});

test('a peer who borrows the name of an online member does not make that member jumpable', async () => {
  addCaret({ name: 'Bruno', color: '#000000' });
  renderMembers({ members: [ana, bruno] });
  const button = screen.getByRole('button', { name: memberLabel({ name: 'Bruno', isOnline: true }) });
  expect(button).toHaveAttribute('aria-disabled', 'true');
});

test('a disabled member is described by its reason while the tooltip is closed', () => {
  renderMembers({ members: [ana, clara] });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: memberLabel({ name: 'Clara', isOnline: false }) })).toHaveAccessibleDescription(
    offlineMemberReason('Clara'),
  );
  expect(screen.getByRole('button', { name: memberLabel({ name: 'Ana', isOnline: true }) })).toHaveAccessibleDescription(
    SELF_MEMBER_REASON,
  );
});

test('below 768 five members show three avatars and a button named 2 more people', () => {
  stubViewportWidth(PHONE_VIEWPORT_WIDTH);
  renderMembers({ members: manyMembers(5) });
  expect(screen.getAllByRole('button').filter((button) => !/more people/.test(String(button.getAttribute('aria-label'))))).toHaveLength(3);
  expect(screen.getByRole('button', { name: moreMembersLabel(2) })).toBeInTheDocument();
});

test('below 768 three members still show all three with no menu', () => {
  stubViewportWidth(PHONE_VIEWPORT_WIDTH);
  renderMembers({ members: manyMembers(3) });
  expect(screen.queryByRole('button', { name: /more people/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(3);
});
