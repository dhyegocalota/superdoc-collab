import {
  ApiPath,
  AppRoute,
  HttpStatus,
  INVITE_TOKEN_HEADER,
  InviteState,
  SIGN_UP_BY_INVITATION_MESSAGE,
  signUpPagePath,
} from '@superdoc-collab/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import { authClient } from './auth-client';
import {
  CLAIM_TITLE,
  EMAIL_FIELD_LABEL,
  INVITED_TITLE,
  INVITE_INVALID_MESSAGE,
  NAME_FIELD_LABEL,
  PASSWORD_FIELD_LABEL,
  SIGN_IN_LABEL,
  SIGN_UP_LABEL,
  SETUP_FAILED_MESSAGE,
} from './auth-copy';
import { SignUpPage } from './sign-up-page';

vi.mock('./auth-client', () => ({ authClient: { signUp: { email: vi.fn() } } }));

const signUpEmail = vi.mocked(authClient.signUp.email);
const TOKEN = 'invite-token';
const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function mockApi({ claimed, inviteStatus, setupStatus = HttpStatus.Ok }: { claimed: boolean; inviteStatus: number; setupStatus?: number }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: null } });
    if (input === ApiPath.Setup) return jsonResponse({ body: { claimed }, status: setupStatus });
    if (input === ApiPath.Invites) return jsonResponse({ body: { state: InviteState.Pending }, status: inviteStatus });
    throw new Error(`unexpected ${String(input)}`);
  });
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(NAME_FIELD_LABEL), 'Eve');
  await user.type(screen.getByLabelText(EMAIL_FIELD_LABEL), 'eve@example.com');
  await user.type(screen.getByLabelText(PASSWORD_FIELD_LABEL), 'long-enough-password');
  await user.click(screen.getByRole('button', { name: SIGN_UP_LABEL }));
}

beforeEach(() => signUpEmail.mockReset());

test('an unclaimed instance offers to claim it and links to sign-in', async () => {
  mockApi({ claimed: false, inviteStatus: HttpStatus.NotFound });
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  expect(await screen.findByText(CLAIM_TITLE)).toBeInTheDocument();
  expect(screen.getByLabelText(NAME_FIELD_LABEL)).toHaveAttribute('autocomplete', 'name');
  expect(screen.getByLabelText(EMAIL_FIELD_LABEL)).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText(PASSWORD_FIELD_LABEL)).toHaveAttribute('autocomplete', 'new-password');
  expect(screen.getByRole('link', { name: SIGN_IN_LABEL })).toHaveAttribute('href', AppRoute.SignIn);
});

test('the claim form sends the three fields and the browser time zone once', async () => {
  mockApi({ claimed: false, inviteStatus: HttpStatus.NotFound });
  signUpEmail.mockResolvedValue({ data: null, error: null } as never);
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  await fillAndSubmit();
  await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
  expect(signUpEmail.mock.calls[0]?.[0]).toEqual({
    name: 'Eve',
    email: 'eve@example.com',
    password: 'long-enough-password',
    timeZone: BROWSER_TIME_ZONE,
  });
});

test('a claimed instance without a token shows only the invalid message', async () => {
  mockApi({ claimed: true, inviteStatus: HttpStatus.NotFound });
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  expect(await screen.findByText(INVITE_INVALID_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: SIGN_UP_LABEL })).not.toBeInTheDocument();
});

test('a pending invite shows the invited form', async () => {
  mockApi({ claimed: true, inviteStatus: HttpStatus.Ok });
  renderWithProviders(<SignUpPage />, { route: signUpPagePath(TOKEN) });
  expect(await screen.findByText(INVITED_TITLE)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SIGN_UP_LABEL })).toBeInTheDocument();
});

test('a dead invite shows the invalid message and never the form', async () => {
  mockApi({ claimed: true, inviteStatus: HttpStatus.NotFound });
  renderWithProviders(<SignUpPage />, { route: signUpPagePath(TOKEN) });
  expect(await screen.findByText(INVITE_INVALID_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: SIGN_UP_LABEL })).not.toBeInTheDocument();
});

test('submitting sends the token in the header; a forbidden sign-up shows the server message', async () => {
  mockApi({ claimed: true, inviteStatus: HttpStatus.Ok });
  signUpEmail.mockResolvedValue({
    data: null,
    error: { status: HttpStatus.Forbidden, message: SIGN_UP_BY_INVITATION_MESSAGE },
  } as never);
  renderWithProviders(<SignUpPage />, { route: signUpPagePath(TOKEN) });
  await fillAndSubmit();
  expect(await screen.findByRole('alert')).toHaveTextContent(SIGN_UP_BY_INVITATION_MESSAGE);
  expect(signUpEmail.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ headers: { [INVITE_TOKEN_HEADER]: TOKEN } }));
});

test('a failed setup check shows an error instead of loading forever', async () => {
  mockApi({ claimed: false, inviteStatus: HttpStatus.NotFound, setupStatus: HttpStatus.InternalServerError });
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  expect(await screen.findByRole('alert')).toHaveTextContent(SETUP_FAILED_MESSAGE);
});

test('the invite check sends the token in a header, never in the URL', async () => {
  const fetchSpy = mockApi({ claimed: true, inviteStatus: HttpStatus.Ok });
  renderWithProviders(<SignUpPage />, { route: signUpPagePath(TOKEN) });
  await screen.findByText(INVITED_TITLE);
  const inviteCall = fetchSpy.mock.calls.find(([input]) => input === ApiPath.Invites);
  expect(new Headers(inviteCall?.[1]?.headers).get(INVITE_TOKEN_HEADER)).toBe(TOKEN);
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes(TOKEN))).toBe(false);
});
