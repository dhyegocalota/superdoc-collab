import { AgentScope, AppRoute } from '@superdoc-history/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { authClient } from '@/features/auth/auth-client';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  APPROVE_LABEL,
  CONSENT_FAILED_MESSAGE,
  DENY_LABEL,
  INCOMPLETE_REQUEST_MESSAGE,
  OFFLINE_ACCESS_LABEL,
  OFFLINE_ACCESS_SCOPE,
  SCOPE_LABELS,
} from './oauth-consent-copy';
import { OAuthConsentPage } from './oauth-consent-page';

vi.mock('@/features/auth/auth-client', () => ({ authClient: { oauth2: { publicClient: vi.fn(), consent: vi.fn() } } }));

const publicClient = vi.mocked(authClient.oauth2.publicClient);
const consent = vi.mocked(authClient.oauth2.consent);
const CLIENT_ID = 'client-1';
const CLIENT_NAME = 'Claude Code';
const REQUESTED_SCOPES = [AgentScope.HistoryRead, AgentScope.DocumentEdit];

function consentRoute(parameters: Record<string, string>): string {
  return `${AppRoute.OAuthConsent}?${new URLSearchParams(parameters)}`;
}

function renderConsentPage(parameters: Record<string, string> = { client_id: CLIENT_ID, scope: REQUESTED_SCOPES.join(' ') }) {
  renderWithProviders(<OAuthConsentPage />, { route: consentRoute(parameters) });
  return userEvent.setup();
}

beforeEach(() => {
  publicClient.mockReset();
  consent.mockReset();
  publicClient.mockResolvedValue({ data: { client_id: CLIENT_ID, client_name: CLIENT_NAME }, error: null } as never);
  consent.mockResolvedValue({ data: null, error: null } as never);
});

test('shows the client name and each requested scope in plain words', async () => {
  renderConsentPage();
  expect(await screen.findByText(new RegExp(CLIENT_NAME))).toBeInTheDocument();
  REQUESTED_SCOPES.forEach((scope) => expect(screen.getByText(SCOPE_LABELS[scope])).toBeInTheDocument());
  expect(screen.queryByText(SCOPE_LABELS[AgentScope.DocumentShare])).not.toBeInTheDocument();
  expect(publicClient).toHaveBeenCalledWith({ query: { client_id: CLIENT_ID } });
});

test.each([
  { label: APPROVE_LABEL, accept: true },
  { label: DENY_LABEL, accept: false },
])('$label posts the consent with accept $accept', async ({ label, accept }) => {
  const user = renderConsentPage();
  await screen.findByText(new RegExp(CLIENT_NAME));
  await user.click(screen.getByRole('button', { name: label }));
  expect(consent).toHaveBeenCalledTimes(1);
  expect(consent).toHaveBeenCalledWith({ accept });
});

test('a failed consent shows the error and lets the person try again', async () => {
  consent.mockResolvedValue({ data: null, error: { status: 500 } } as never);
  const user = renderConsentPage();
  await screen.findByText(new RegExp(CLIENT_NAME));
  await user.click(screen.getByRole('button', { name: APPROVE_LABEL }));
  expect(await screen.findByText(CONSENT_FAILED_MESSAGE)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: APPROVE_LABEL })).toBeEnabled();
});

test('a request without a client id shows the incomplete message and calls nothing', () => {
  renderConsentPage({ scope: AgentScope.HistoryRead });
  expect(screen.getByText(INCOMPLETE_REQUEST_MESSAGE)).toBeInTheDocument();
  expect(publicClient).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: APPROVE_LABEL })).not.toBeInTheDocument();
});

test('the offline access scope is shown in plain words', async () => {
  renderConsentPage({ client_id: CLIENT_ID, scope: [AgentScope.HistoryRead, OFFLINE_ACCESS_SCOPE].join(' ') });
  expect(await screen.findByText(OFFLINE_ACCESS_LABEL)).toBeInTheDocument();
  expect(screen.queryByText(OFFLINE_ACCESS_SCOPE)).not.toBeInTheDocument();
});
