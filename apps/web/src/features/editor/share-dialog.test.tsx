import {
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  LINK_COPIED_MESSAGE,
  ShareLinkRole,
  type ShareLinks,
} from '@superdoc-history/types';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  COPY_FAILED_MESSAGE,
  COPY_LABEL,
  LOADING_SHARE_LINKS_LABEL,
  RESET_FAILED_MESSAGE,
  RESET_LINK_LABEL,
  SHARE_DIALOG_DESCRIPTION,
  SHARE_LABEL,
  SHARE_LINK_LABELS,
} from './editor-copy';
import { COPIED_NOTICE_MS, ShareDialog } from './share-dialog';

const SHARE_LINKS_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.ShareLinks });
const ROTATE_EDIT_PATH = `${SHARE_LINKS_PATH}/${ShareLinkRole.Edit}/rotate`;
const LINKS: ShareLinks = {
  [ShareLinkRole.Edit]: 'http://localhost/share/edit-token',
  [ShareLinkRole.Read]: 'http://localhost/share/read-token',
};
const ROTATED_LINKS: ShareLinks = { ...LINKS, [ShareLinkRole.Edit]: 'http://localhost/share/rotated-token' };

afterEach(() => vi.restoreAllMocks());

function mockShareApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ROTATE_EDIT_PATH && init?.method === HttpMethod.Post) return new Response(JSON.stringify(ROTATED_LINKS));
    return new Response(JSON.stringify(LINKS));
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
    return new Response(JSON.stringify(LINKS));
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
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockShareApi();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  await openDialog();
  const readRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  const copyButton = within(readRow).getByRole('button', { name: COPY_LABEL });
  await user.click(copyButton);
  expect(await within(readRow).findByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(COPIED_NOTICE_MS / 2));
  await user.click(copyButton);
  act(() => vi.advanceTimersByTime(COPIED_NOTICE_MS / 2));
  expect(within(readRow).getByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(COPIED_NOTICE_MS / 2));
  expect(within(readRow).queryByText(LINK_COPIED_MESSAGE)).not.toBeInTheDocument();
  vi.useRealTimers();
});
