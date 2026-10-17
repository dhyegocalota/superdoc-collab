import { AgentScope, ApiPath } from '@superdoc-history/types';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { authClient } from '@/features/auth/auth-client';
import { SCOPE_LABELS } from '@/features/oauth-consent/oauth-consent-copy';
import { formatTimestamp } from '@/lib/format-date-time';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  CONNECTED_APPS_EMPTY_MESSAGE,
  CONNECTED_APPS_LOAD_ERROR_MESSAGE,
  copyLabel,
  MCP_CLIENT_LABELS,
  MCP_SNIPPETS,
  MCP_URL_LABEL,
  McpClient,
  REVOKE_ERROR_MESSAGE,
  revokeLabel,
} from './connected-apps-copy';
import { ConnectedAppsPage } from './connected-apps-page';

vi.mock('@/features/auth/auth-client', () => ({
  authClient: { oauth2: { getConsents: vi.fn(), deleteConsent: vi.fn(), publicClient: vi.fn() } },
}));

const getConsents = vi.mocked(authClient.oauth2.getConsents);
const deleteConsent = vi.mocked(authClient.oauth2.deleteConsent);
const publicClient = vi.mocked(authClient.oauth2.publicClient);
const CONSENT = {
  id: 'consent-1',
  clientId: 'client-1',
  scopes: [AgentScope.HistoryRead, AgentScope.DocumentExport],
  createdAt: new Date(Date.UTC(2026, 9, 16, 12, 0)).toISOString(),
};
const CLIENT_NAME = 'Claude Code';
const MCP_URL = `${window.location.origin}${ApiPath.Mcp}`;

beforeEach(() => {
  getConsents.mockReset();
  deleteConsent.mockReset();
  publicClient.mockReset();
  getConsents.mockResolvedValue({ data: [CONSENT], error: null } as never);
  deleteConsent.mockResolvedValue({ data: null, error: null } as never);
  publicClient.mockResolvedValue({ data: { client_id: CONSENT.clientId, client_name: CLIENT_NAME }, error: null } as never);
});

test('lists each client with its name, connected date and scopes', async () => {
  renderWithProviders(<ConnectedAppsPage />);
  const row = (await screen.findByText(CLIENT_NAME)).closest('li');
  if (!row) throw new Error('row not found');
  expect(within(row).getByText(formatTimestamp(new Date(CONSENT.createdAt).getTime()), { exact: false })).toBeInTheDocument();
  CONSENT.scopes.forEach((scope) => expect(within(row).getByText(SCOPE_LABELS[scope])).toBeInTheDocument());
  expect(publicClient).toHaveBeenCalledWith({ query: { client_id: CONSENT.clientId } });
});

test('revoking deletes the consent and refetches the list', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ConnectedAppsPage />);
  getConsents.mockResolvedValue({ data: [], error: null } as never);
  await user.click(await screen.findByRole('button', { name: revokeLabel(CLIENT_NAME) }));
  expect(deleteConsent).toHaveBeenCalledWith({ id: CONSENT.id });
  expect(await screen.findByText(CONNECTED_APPS_EMPTY_MESSAGE)).toBeInTheDocument();
  expect(getConsents).toHaveBeenCalledTimes(2);
});

test('a failed revoke keeps the row and shows the error', async () => {
  deleteConsent.mockResolvedValue({ data: null, error: { status: 500 } } as never);
  const user = userEvent.setup();
  renderWithProviders(<ConnectedAppsPage />);
  await user.click(await screen.findByRole('button', { name: revokeLabel(CLIENT_NAME) }));
  expect(await screen.findByText(REVOKE_ERROR_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(CLIENT_NAME)).toBeInTheDocument();
});

test('no consents shows the empty message', async () => {
  getConsents.mockResolvedValue({ data: [], error: null } as never);
  renderWithProviders(<ConnectedAppsPage />);
  expect(await screen.findByText(CONNECTED_APPS_EMPTY_MESSAGE)).toBeInTheDocument();
});

test('a failed list shows the load error', async () => {
  getConsents.mockResolvedValue({ data: null, error: { status: 500 } } as never);
  renderWithProviders(<ConnectedAppsPage />);
  expect(await screen.findByText(CONNECTED_APPS_LOAD_ERROR_MESSAGE)).toBeInTheDocument();
});

test.each([
  { subject: MCP_URL_LABEL, expected: MCP_URL },
  ...Object.values(McpClient).map((client) => ({ subject: MCP_CLIENT_LABELS[client], expected: MCP_SNIPPETS[client](MCP_URL) })),
])('the copy button of $subject copies its text', async ({ subject, expected }) => {
  getConsents.mockResolvedValue({ data: [], error: null } as never);
  const user = userEvent.setup();
  renderWithProviders(<ConnectedAppsPage />);
  await user.click(await screen.findByRole('button', { name: copyLabel(subject) }));
  await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(expected));
});
