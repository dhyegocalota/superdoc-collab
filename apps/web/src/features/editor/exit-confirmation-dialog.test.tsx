import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Link } from 'react-router';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { DOWNLOAD_BUTTON_LABEL, EXIT_CONFIRMATION_DESCRIPTION, EXIT_CONFIRMATION_TITLE, LEAVE_LABEL, STAY_LABEL } from './editor-copy';
import { ExitConfirmationDialog } from './exit-confirmation-dialog';

const EDITOR_PATH = '/documents/doc-1';
const LEAVING_PATH = '/documents';
const LEAVING_LINK = 'Documents';
const SYNC_BUTTON = 'Sync now';

function Harness({ onDownload, isInitiallyUnsynced }: { onDownload: () => void; isInitiallyUnsynced: boolean }) {
  const [isUnsynced, setIsUnsynced] = useState(isInitiallyUnsynced);
  return (
    <>
      <Link to={LEAVING_PATH}>{LEAVING_LINK}</Link>
      <button type="button" onClick={() => setIsUnsynced(false)}>
        {SYNC_BUTTON}
      </button>
      <ExitConfirmationDialog isUnsynced={isUnsynced} onDownload={onDownload} />
    </>
  );
}

function renderDialog({ isUnsynced = true, onDownload = vi.fn() } = {}) {
  const { router } = renderWithProviders(<Harness onDownload={onDownload} isInitiallyUnsynced={isUnsynced} />, { route: EDITOR_PATH });
  return { router, onDownload };
}

test('navigating away while synced does not ask', async () => {
  const { router } = renderDialog({ isUnsynced: false });
  await userEvent.click(screen.getByRole('link', { name: LEAVING_LINK }));
  expect(router.state.location.pathname).toBe(LEAVING_PATH);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('navigating away while unsynced asks and Stay keeps the route', async () => {
  const { router } = renderDialog();
  await userEvent.click(screen.getByRole('link', { name: LEAVING_LINK }));
  const dialog = await screen.findByRole('alertdialog', { name: EXIT_CONFIRMATION_TITLE });
  expect(dialog).toHaveAccessibleDescription(EXIT_CONFIRMATION_DESCRIPTION);
  await userEvent.click(screen.getByRole('button', { name: STAY_LABEL }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(router.state.location.pathname).toBe(EDITOR_PATH);
});

test('Leave proceeds with the navigation', async () => {
  const { router } = renderDialog();
  await userEvent.click(screen.getByRole('link', { name: LEAVING_LINK }));
  await userEvent.click(await screen.findByRole('button', { name: LEAVE_LABEL }));
  await waitFor(() => expect(router.state.location.pathname).toBe(LEAVING_PATH));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('Escape stays on the route', async () => {
  const { router } = renderDialog();
  await userEvent.click(screen.getByRole('link', { name: LEAVING_LINK }));
  await screen.findByRole('alertdialog');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(router.state.location.pathname).toBe(EDITOR_PATH);
});

test('Download calls the download and keeps the dialog open', async () => {
  const { router, onDownload } = renderDialog();
  await userEvent.click(screen.getByRole('link', { name: LEAVING_LINK }));
  await userEvent.click(await screen.findByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(onDownload).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alertdialog')).toBeVisible();
  expect(router.state.location.pathname).toBe(EDITOR_PATH);
});

test('sync recovering while the dialog is open closes it and proceeds', async () => {
  const { router } = renderDialog();
  await userEvent.click(screen.getByRole('link', { name: LEAVING_LINK }));
  await screen.findByRole('alertdialog');
  act(() => screen.getByText(SYNC_BUTTON).click());
  await waitFor(() => expect(router.state.location.pathname).toBe(LEAVING_PATH));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
