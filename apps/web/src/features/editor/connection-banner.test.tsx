import { ConnectionFailureReason, ConnectionState } from '@superdoc-collab/types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ConnectionBanner } from './connection-banner';
import {
  FAILED_TITLE,
  FAILURE_REASON_COPY,
  KEPT_AND_DATED_DETAIL,
  LOST_TITLE,
  RECONNECTING_TITLE,
  RECOVERED_TITLE,
  RELOAD_LABEL,
  RELOADING_LABEL,
  UNSYNCED_LOST_ON_RELOAD_DETAIL,
} from './connection-copy';

afterEach(cleanup);

function renderBanner({
  state,
  failureReason = null,
  onReload = vi.fn(),
  isReloading = false,
}: {
  state: ConnectionState;
  failureReason?: ConnectionFailureReason | null;
  onReload?: () => void;
  isReloading?: boolean;
}) {
  render(<ConnectionBanner state={state} failureReason={failureReason} isReloading={isReloading} onReload={onReload} />);
}

test.each([
  { state: ConnectionState.Lost, title: LOST_TITLE, hasKeptDetail: true },
  { state: ConnectionState.Reconnecting, title: RECONNECTING_TITLE, hasKeptDetail: true },
  { state: ConnectionState.Recovered, title: RECOVERED_TITLE, hasKeptDetail: false },
  { state: ConnectionState.Failed, title: FAILED_TITLE, hasKeptDetail: false },
])('$state shows its title', ({ state, title, hasKeptDetail }) => {
  renderBanner({ state, failureReason: state === ConnectionState.Failed ? ConnectionFailureReason.AccessDenied : null });
  const banner = screen.getByTestId('connection-banner');
  expect(banner).toHaveAttribute('data-state', state);
  expect(banner).toHaveTextContent(title);
  expect(screen.queryByText(KEPT_AND_DATED_DETAIL) !== null).toBe(hasKeptDetail);
});

test.each([
  { state: ConnectionState.Lost, role: 'status' },
  { state: ConnectionState.Reconnecting, role: 'status' },
  { state: ConnectionState.Recovered, role: 'status' },
  { state: ConnectionState.Failed, role: 'alert' },
])('$state uses role $role', ({ state, role }) => {
  renderBanner({ state, failureReason: ConnectionFailureReason.ConnectionFailed });
  expect(screen.getByTestId('connection-banner')).toHaveAttribute('role', role);
});

test('Failed names the reason and warns that unsynced edits are lost on reload', () => {
  renderBanner({ state: ConnectionState.Failed, failureReason: ConnectionFailureReason.SyncTimeout });
  expect(screen.getByTestId('connection-banner')).toHaveTextContent(FAILURE_REASON_COPY[ConnectionFailureReason.SyncTimeout]);
  expect(screen.getByTestId('connection-banner')).toHaveTextContent(UNSYNCED_LOST_ON_RELOAD_DETAIL);
});

test('an Unknown reason shows the generic failure line', () => {
  renderBanner({ state: ConnectionState.Failed, failureReason: ConnectionFailureReason.Unknown });
  expect(screen.getByTestId('connection-banner')).toHaveTextContent(FAILURE_REASON_COPY[ConnectionFailureReason.Unknown]);
});

test.each([ConnectionState.Lost, ConnectionState.Reconnecting, ConnectionState.Recovered])(
  '%s neither warns about reload nor offers it',
  (state) => {
    renderBanner({ state });
    expect(screen.getByTestId('connection-banner')).not.toHaveTextContent(UNSYNCED_LOST_ON_RELOAD_DETAIL);
    expect(screen.queryByRole('button', { name: RELOAD_LABEL })).not.toBeInTheDocument();
  },
);

test('Online renders nothing', () => {
  renderBanner({ state: ConnectionState.Online });
  expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument();
});

test('Reload calls onReload once', async () => {
  const onReload = vi.fn();
  renderBanner({ state: ConnectionState.Failed, failureReason: ConnectionFailureReason.Unknown, onReload });
  await userEvent.click(screen.getByRole('button', { name: RELOAD_LABEL }));
  expect(onReload).toHaveBeenCalledTimes(1);
});

test('Failed is the title and one paragraph holding the reason and the unsynced warning', () => {
  renderBanner({ state: ConnectionState.Failed, failureReason: ConnectionFailureReason.SyncTimeout });
  const paragraphs = screen.getByTestId('connection-banner').querySelectorAll('p');
  expect(paragraphs).toHaveLength(2);
  expect(paragraphs[1]).toHaveClass('text-sm', 'leading-5');
  expect(paragraphs[1]).toHaveTextContent(`${FAILURE_REASON_COPY[ConnectionFailureReason.SyncTimeout]} ${UNSYNCED_LOST_ON_RELOAD_DETAIL}`);
});

test('while reloading the button is disabled and says so', () => {
  renderBanner({ state: ConnectionState.Failed, failureReason: ConnectionFailureReason.Unknown, isReloading: true });
  expect(screen.getByRole('button', { name: RELOADING_LABEL })).toBeDisabled();
});
