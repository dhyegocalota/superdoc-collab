import {
  documentApiPath,
  DocumentResource,
  DocumentRole,
  HttpMethod,
  HttpStatus,
  LINK_COPIED_MESSAGE,
  memberApiPath,
  ShareLinkRole,
  type DocumentMember,
  type DocumentMembers,
  type ShareLinks,
} from '@superdoc-collab/types';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ROLE_LABELS } from '@/features/documents/documents-copy';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  COPY_FAILED_MESSAGE,
  COPY_LABEL,
  LOADING_SHARE_LINKS_LABEL,
  PEOPLE_WITH_ACCESS_LABEL,
  REMOVE_FAILED_MESSAGE,
  removeMemberLabel,
  RESET_FAILED_MESSAGE,
  RESET_LINK_LABEL,
  SHARE_DIALOG_DESCRIPTION,
  SHARE_LABEL,
  SHARE_LINK_LABELS,
  SHARE_LINKS_LOAD_ERROR_MESSAGE,
} from './editor-copy';
import { COPIED_NOTICE_MS, ShareDialog } from './share-dialog';

const SHARE_LINKS_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.ShareLinks });
const ROTATE_EDIT_PATH = `${SHARE_LINKS_PATH}/${ShareLinkRole.Edit}/rotate`;
const LINKS: ShareLinks = {
  [ShareLinkRole.Edit]: 'http://localhost/share/edit-token',
  [ShareLinkRole.Read]: 'http://localhost/share/read-token',
};
const ROTATED_LINKS: ShareLinks = { ...LINKS, [ShareLinkRole.Edit]: 'http://localhost/share/rotated-token' };
const MEMBERS_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Members });
const OWNER_MEMBER: DocumentMember = { user: { id: 'owner-id', name: 'Ana' }, role: DocumentRole.Owner, online: true, colorSlot: 0 };
const READER_MEMBER: DocumentMember = { user: { id: 'reader-id', name: 'Bruno' }, role: DocumentRole.Reader, online: false, colorSlot: 1 };
const EDITOR_MEMBER: DocumentMember = { user: { id: 'editor-id', name: 'Carla' }, role: DocumentRole.Editor, online: false, colorSlot: 2 };
const READER_PATH = memberApiPath({ documentId: DOCUMENT_ID, userId: READER_MEMBER.user.id });
const NOTICE_FAKE_TIMERS = { toFake: ['setTimeout', 'clearTimeout'] } satisfies Parameters<typeof vi.useFakeTimers>[0];

afterEach(() => vi.restoreAllMocks());

function membersAnswer(members: DocumentMember[]): DocumentMembers {
  return { members, isCurrentUserOnline: true, isAttemptSuperseded: false };
}

function mockShareApi({ members = [OWNER_MEMBER, READER_MEMBER, EDITOR_MEMBER] }: { members?: DocumentMember[] } = {}) {
  const remaining = [...members];
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ROTATE_EDIT_PATH && init?.method === HttpMethod.Post) return jsonResponse({ body: ROTATED_LINKS });
    if (input === READER_PATH && init?.method === HttpMethod.Delete) {
      remaining.splice(remaining.indexOf(READER_MEMBER), 1);
      return new Response(null, { status: HttpStatus.NoContent });
    }
    if (typeof input === 'string' && input.startsWith(MEMBERS_PATH)) return jsonResponse({ body: membersAnswer(remaining) });
    return jsonResponse({ body: LINKS });
  });
}

async function openDialog(): Promise<void> {
  renderWithProviders(<ShareDialog documentId={DOCUMENT_ID} />);
  await userEvent.click(screen.getByRole('button', { name: SHARE_LABEL }));
}

test('opening loads both links', async () => {
  const fetchSpy = mockShareApi();
  await openDialog();
  expect(await screen.findByDisplayValue(LINKS[ShareLinkRole.Edit])).toBeInTheDocument();
  expect(screen.getByDisplayValue(LINKS[ShareLinkRole.Read])).toBeInTheDocument();
  expect(fetchSpy).toHaveBeenCalledWith(SHARE_LINKS_PATH, expect.anything());
});

test('Copy writes the url to the clipboard and confirms', async () => {
  mockShareApi();
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  await openDialog();
  const readRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  await user.click(within(readRow).getByRole('button', { name: COPY_LABEL }));
  expect(writeText).toHaveBeenCalledWith(LINKS[ShareLinkRole.Read]);
  expect(await within(readRow).findByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
});

test('Reset link on the edit row posts the rotation and shows the new url', async () => {
  const fetchSpy = mockShareApi();
  await openDialog();
  const editRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Edit] });
  await userEvent.click(within(editRow).getByRole('button', { name: RESET_LINK_LABEL }));
  expect(await screen.findByDisplayValue(ROTATED_LINKS[ShareLinkRole.Edit])).toBeInTheDocument();
  expect(fetchSpy).toHaveBeenCalledWith(ROTATE_EDIT_PATH, expect.objectContaining({ method: HttpMethod.Post }));
  expect(screen.getByDisplayValue(LINKS[ShareLinkRole.Read])).toBeInTheDocument();
});

test('a failed reset shows an alert and keeps the old url', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method === HttpMethod.Post) return new Response(null, { status: HttpStatus.Forbidden });
    return jsonResponse({ body: LINKS });
  });
  await openDialog();
  const editRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Edit] });
  await userEvent.click(within(editRow).getByRole('button', { name: RESET_LINK_LABEL }));
  expect(await within(editRow).findByRole('alert')).toHaveTextContent(RESET_FAILED_MESSAGE);
  expect(screen.getByDisplayValue(LINKS[ShareLinkRole.Edit])).toBeInTheDocument();
});

test('the dialog says resetting stops the old link', async () => {
  mockShareApi();
  await openDialog();
  expect(screen.getByText(SHARE_DIALOG_DESCRIPTION)).toHaveTextContent('stops the old one from working');
});

test('two placeholder rows show while the links load', async () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => undefined));
  await openDialog();
  expect(screen.getByRole('status', { name: LOADING_SHARE_LINKS_LABEL })).toBeInTheDocument();
});

test('a refused clipboard selects the link and says how to copy it', async () => {
  mockShareApi();
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
  await openDialog();
  const readRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  await user.click(within(readRow).getByRole('button', { name: COPY_LABEL }));
  expect(await within(readRow).findByRole('status')).toHaveTextContent(COPY_FAILED_MESSAGE);
  const input = within(readRow).getByDisplayValue(LINKS[ShareLinkRole.Read]) as HTMLInputElement;
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(LINKS[ShareLinkRole.Read].length);
});

test('a missing clipboard falls back the same way', async () => {
  mockShareApi();
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => {
    throw new TypeError('clipboard unavailable');
  });
  await openDialog();
  const readRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  await user.click(within(readRow).getByRole('button', { name: COPY_LABEL }));
  expect(await within(readRow).findByRole('status')).toHaveTextContent(COPY_FAILED_MESSAGE);
});

test('Link copied clears after a few seconds', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockShareApi();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  await openDialog();
  const readRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  await user.click(within(readRow).getByRole('button', { name: COPY_LABEL }));
  expect(await within(readRow).findByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(COPIED_NOTICE_MS));
  expect(within(readRow).queryByText(LINK_COPIED_MESSAGE)).not.toBeInTheDocument();
  vi.useRealTimers();
});

test('copying again keeps Link copied for a full period from the second copy', async () => {
  mockShareApi();
  userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  await openDialog();
  const readRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  const copyButton = within(readRow).getByRole('button', { name: COPY_LABEL });
  vi.useFakeTimers(NOTICE_FAKE_TIMERS);
  await act(async () => fireEvent.click(copyButton));
  expect(within(readRow).getByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(COPIED_NOTICE_MS / 2));
  await act(async () => fireEvent.click(copyButton));
  act(() => vi.advanceTimersByTime(COPIED_NOTICE_MS / 2));
  expect(within(readRow).getByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(COPIED_NOTICE_MS / 2));
  expect(within(readRow).queryByText(LINK_COPIED_MESSAGE)).not.toBeInTheDocument();
  vi.useRealTimers();
});

test('links that fail to load show an alert instead of placeholders', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.Forbidden }));
  await openDialog();
  expect(await screen.findByRole('alert')).toHaveTextContent(SHARE_LINKS_LOAD_ERROR_MESSAGE);
  expect(screen.queryByRole('status', { name: LOADING_SHARE_LINKS_LABEL })).not.toBeInTheDocument();
});

test('copying the other link moves Link copied to that row', async () => {
  mockShareApi();
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  await openDialog();
  const editRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Edit] });
  const readRow = screen.getByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  await user.click(within(editRow).getByRole('button', { name: COPY_LABEL }));
  await user.click(within(readRow).getByRole('button', { name: COPY_LABEL }));
  expect(await within(readRow).findByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
  expect(within(editRow).queryByText(LINK_COPIED_MESSAGE)).not.toBeInTheDocument();
});

test('the dialog lists the members with their role labels and no Remove on the owner', async () => {
  mockShareApi();
  await openDialog();
  const people = await screen.findByRole('group', { name: PEOPLE_WITH_ACCESS_LABEL });
  const rows = within(people).getAllByRole('listitem');
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining(`Ana${ROLE_LABELS[DocumentRole.Owner]}`),
    expect.stringContaining(`Bruno${ROLE_LABELS[DocumentRole.Reader]}`),
    expect.stringContaining(`Carla${ROLE_LABELS[DocumentRole.Editor]}`),
  ]);
  expect(within(people).queryByRole('button', { name: removeMemberLabel('Ana') })).not.toBeInTheDocument();
  expect(within(people).getByRole('button', { name: removeMemberLabel('Bruno') })).toBeInTheDocument();
  expect(within(people).getByRole('button', { name: removeMemberLabel('Carla') })).toBeInTheDocument();
});

test('Remove deletes the member and the list refreshes without them', async () => {
  const fetchSpy = mockShareApi();
  await openDialog();
  const people = await screen.findByRole('group', { name: PEOPLE_WITH_ACCESS_LABEL });
  await userEvent.click(within(people).getByRole('button', { name: removeMemberLabel('Bruno') }));
  expect(fetchSpy).toHaveBeenCalledWith(READER_PATH, expect.objectContaining({ method: HttpMethod.Delete }));
  await waitFor(() => expect(within(people).queryByText('Bruno')).not.toBeInTheDocument());
  expect(within(people).getByText('Carla')).toBeInTheDocument();
});

test('a failed removal shows an alert and keeps the row', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method === HttpMethod.Delete) return new Response(null, { status: HttpStatus.InternalServerError });
    if (typeof input === 'string' && input.startsWith(MEMBERS_PATH))
      return jsonResponse({ body: membersAnswer([OWNER_MEMBER, READER_MEMBER]) });
    return jsonResponse({ body: LINKS });
  });
  await openDialog();
  const people = await screen.findByRole('group', { name: PEOPLE_WITH_ACCESS_LABEL });
  await userEvent.click(within(people).getByRole('button', { name: removeMemberLabel('Bruno') }));
  expect(await within(people).findByRole('alert')).toHaveTextContent(REMOVE_FAILED_MESSAGE);
  expect(within(people).getByText('Bruno')).toBeInTheDocument();
});
