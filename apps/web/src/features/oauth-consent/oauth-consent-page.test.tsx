import { AgentScope, AppRoute, OFFLINE_ACCESS_SCOPE } from '@superdoc-history/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { authClient } from '@/features/auth/auth-client';
import { EXPIRED_REQUEST_MESSAGE } from '@/features/auth/auth-copy';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  APPROVE_LABEL,
  appRedirectNotice,
  CLIENT_LOAD_ERROR_MESSAGE,
  consentDescription,
  CONSENT_FAILED_MESSAGE,
  DENY_LABEL,
  INCOMPLETE_REQUEST_MESSAGE,
  OFFLINE_ACCESS_LABEL,
  redirectNotice,
  SCOPE_LABELS,
} from './oauth-consent-copy';
import { OAuthConsentPage } from './oauth-consent-page';

vi.mock('@/features/auth/auth-client', () => ({ authClient: { oauth2: { publicClient: vi.fn(), consent: vi.fn() } } }));

const publicClient = vi.mocked(authClient.oauth2.publicClient);
const consent = vi.mocked(authClient.oauth2.consent);
const CLIENT_ID = 'client-1';
const CLIENT_NAME = 'Claude Code';
const REDIRECT_URI = 'https://client.example/callback';
const REDIRECT_HOST = 'client.example';
const REQUESTED_SCOPES = [AgentScope.HistoryRead, AgentScope.DocumentEdit];

function consentRoute(parameters: Record<string, string>): string {
  return `${AppRoute.OAuthConsent}?${new URLSearchParams(parameters)}`;
}

function renderConsentPage(
  parameters: Record<string, string> = { client_id: CLIENT_ID, scope: REQUESTED_SCOPES.join(' '), redirect_uri: REDIRECT_URI },
) {
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
  renderConsentPage({ scope: AgentScope.HistoryRead, redirect_uri: REDIRECT_URI });
  expect(screen.getByText(INCOMPLETE_REQUEST_MESSAGE)).toBeInTheDocument();
  expect(publicClient).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: APPROVE_LABEL })).not.toBeInTheDocument();
});

test('the offline access scope is shown in plain words', async () => {
  renderConsentPage({ client_id: CLIENT_ID, scope: [AgentScope.HistoryRead, OFFLINE_ACCESS_SCOPE].join(' '), redirect_uri: REDIRECT_URI });
  expect(await screen.findByText(OFFLINE_ACCESS_LABEL)).toBeInTheDocument();
  expect(screen.queryByText(OFFLINE_ACCESS_SCOPE)).not.toBeInTheDocument();
});

test('shows the host the access will be sent to', async () => {
  renderConsentPage();
  expect(await screen.findByText(redirectNotice(REDIRECT_HOST))).toBeInTheDocument();
});

test.each([{ redirect_uri: 'not a url' }, { redirect_uri: '' }])(
  'a redirect_uri of "$redirect_uri" shows the incomplete message',
  ({ redirect_uri }) => {
    renderConsentPage({ client_id: CLIENT_ID, scope: AgentScope.HistoryRead, redirect_uri });
    expect(screen.getByText(INCOMPLETE_REQUEST_MESSAGE)).toBeInTheDocument();
    expect(publicClient).not.toHaveBeenCalled();
  },
);

test('a client without a name is shown by its redirect host and can still be answered', async () => {
  publicClient.mockResolvedValue({ data: { client_id: CLIENT_ID }, error: null } as never);
  const user = renderConsentPage();
  expect(await screen.findByText(consentDescription(REDIRECT_HOST))).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: APPROVE_LABEL }));
  expect(consent).toHaveBeenCalledWith({ accept: true });
});

test('a failed client lookup shows the load error and offers no Approve', async () => {
  publicClient.mockResolvedValue({ data: null, error: { status: 500 } } as never);
  renderConsentPage();
  expect(await screen.findByText(CLIENT_LOAD_ERROR_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: APPROVE_LABEL })).not.toBeInTheDocument();
});

test('a private-use scheme redirect names the app by its scheme', async () => {
  renderConsentPage({ client_id: CLIENT_ID, scope: AgentScope.HistoryRead, redirect_uri: 'com.example.app:/callback' });
  expect(await screen.findByText(appRedirectNotice('com.example.app'))).toBeInTheDocument();
});

test('an expired signed query asks to start again from the AI client', async () => {
  consent.mockResolvedValue({ data: null, error: { status: 400, error: 'invalid_signature' } } as never);
  const user = renderConsentPage();
  await screen.findByText(new RegExp(CLIENT_NAME));
  await user.click(screen.getByRole('button', { name: APPROVE_LABEL }));
  expect(await screen.findByText(EXPIRED_REQUEST_MESSAGE)).toBeInTheDocument();
});
