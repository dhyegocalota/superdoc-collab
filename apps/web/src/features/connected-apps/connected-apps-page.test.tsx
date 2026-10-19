import { AgentScope, ApiPath, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { accountMenuLabel } from '@/features/account/account-copy';
import { authClient } from '@/features/auth/auth-client';
import { SIGN_OUT_LABEL } from '@/features/auth/auth-copy';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { HOME_LINK_LABEL } from '@/features/editor/editor-copy';
import { CLIENT_LOAD_ERROR_MESSAGE, SCOPE_LABELS } from '@/features/oauth-consent/oauth-consent-copy';
import { browserTimeZone } from '@/lib/browser-time-zone';
import { formatTimestamp } from '@/lib/format-date-time';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  CONNECTED_APPS_EMPTY_MESSAGE,
  CONNECTED_APPS_LOAD_ERROR_MESSAGE,
  copyLabel,
  EXAMPLE_PROMPTS_HEADING,
  LIBRARY_PROMPTS,
  MCP_CLIENT_LABELS,
  MCP_SNIPPETS,
  McpClient,
  REVOKE_ERROR_MESSAGE,
  revokeLabel,
  UNNAMED_CLIENT_LABEL,
  USE_WITH_AI_DESCRIPTION,
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
const CLIENT_NAME = 'Claude Desktop';
const USER: SessionUser = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  role: UserRole.User,
  timeZone: 'UTC',
  impersonatedBy: null,
};
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
  expect(
    within(row).getByText(formatTimestamp({ time: new Date(CONSENT.createdAt).getTime(), timeZone: browserTimeZone() }), { exact: false }),
  ).toBeInTheDocument();
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

test('a client without a name keeps its row with Revoke', async () => {
  publicClient.mockResolvedValue({ data: { client_id: CONSENT.clientId }, error: null } as never);
  const user = userEvent.setup();
  renderWithProviders(<ConnectedAppsPage />);
  await user.click(await screen.findByRole('button', { name: revokeLabel(UNNAMED_CLIENT_LABEL) }));
  expect(deleteConsent).toHaveBeenCalledWith({ id: CONSENT.id });
});

test('a failed name lookup shows a row error and keeps Revoke', async () => {
  publicClient.mockResolvedValue({ data: null, error: { status: 500 } } as never);
  const user = userEvent.setup();
  renderWithProviders(<ConnectedAppsPage />);
  expect(await screen.findByText(CLIENT_LOAD_ERROR_MESSAGE)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: revokeLabel(UNNAMED_CLIENT_LABEL) }));
  expect(deleteConsent).toHaveBeenCalledWith({ id: CONSENT.id });
});

test('the page shows the client tabs, the description and the library prompts', async () => {
  getConsents.mockResolvedValue({ data: [], error: null } as never);
  renderWithProviders(<ConnectedAppsPage />);
  expect(await screen.findByText(USE_WITH_AI_DESCRIPTION)).toBeInTheDocument();
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
    Object.values(McpClient).map((client) => MCP_CLIENT_LABELS[client]),
  );
  expect(screen.getByText(MCP_SNIPPETS[McpClient.ClaudeCode](MCP_URL))).toBeInTheDocument();
  expect(screen.getByText(EXAMPLE_PROMPTS_HEADING)).toBeInTheDocument();
  LIBRARY_PROMPTS.forEach((prompt) => expect(screen.getByText(prompt)).toBeInTheDocument());
});

test('revoking an app that is already revoked removes the row without an error', async () => {
  deleteConsent.mockResolvedValue({ data: null, error: { status: 404 } } as never);
  const user = userEvent.setup();
  renderWithProviders(<ConnectedAppsPage />);
  getConsents.mockResolvedValue({ data: [], error: null } as never);
  await user.click(await screen.findByRole('button', { name: revokeLabel(CLIENT_NAME) }));
  expect(await screen.findByText(CONNECTED_APPS_EMPTY_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText(REVOKE_ERROR_MESSAGE)).not.toBeInTheDocument();
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

test.each(
  Object.values(McpClient).map((client) => ({ subject: MCP_CLIENT_LABELS[client], expected: MCP_SNIPPETS[client](MCP_URL), client })),
)('the copy button of $subject copies its text', async ({ subject, expected, client }) => {
  getConsents.mockResolvedValue({ data: [], error: null } as never);
  const user = userEvent.setup();
  renderWithProviders(<ConnectedAppsPage />);
  await user.click(await screen.findByRole('tab', { name: MCP_CLIENT_LABELS[client] }));
  await user.click(await screen.findByRole('button', { name: copyLabel(subject) }));
  await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(expected));
});

test('the header has no Back to documents link and no Sign out button, and shows the account menu', async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, USER);
  renderWithProviders(<ConnectedAppsPage />, { queryClient });
  const header = screen.getByRole('banner');
  expect(within(header).getByRole('link', { name: HOME_LINK_LABEL })).toBeInTheDocument();
  expect(within(header).getByRole('button', { name: accountMenuLabel(USER.name) })).toBeInTheDocument();
  expect(within(header).getAllByRole('link')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: SIGN_OUT_LABEL })).not.toBeInTheDocument();
});
