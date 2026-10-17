import { expect, test } from 'vitest';
import { DAY_MS } from './constants';
import { INVITE_TTL_MS, InviteState, inviteStateOf, inviteTokenOf, MissingInviteTokenError } from './invites';

const NOW = Date.UTC(2026, 9, 17, 12, 0);

test('the invite lifetime is seven days', () => {
  expect(INVITE_TTL_MS).toBe(7 * DAY_MS);
});

test.each([
  ['pending', { expiresAt: NOW + DAY_MS, acceptedAt: null, revokedAt: null }, InviteState.Pending],
  ['accepted', { expiresAt: NOW + DAY_MS, acceptedAt: NOW - 1, revokedAt: null }, InviteState.Accepted],
  ['revoked', { expiresAt: NOW + DAY_MS, acceptedAt: null, revokedAt: NOW - 1 }, InviteState.Revoked],
  ['expired', { expiresAt: NOW - 1, acceptedAt: null, revokedAt: null }, InviteState.Expired],
  ['expiring exactly now is expired', { expiresAt: NOW, acceptedAt: null, revokedAt: null }, InviteState.Expired],
  [
    'accepted before expiry stays accepted after it',
    { expiresAt: NOW - 1, acceptedAt: NOW - DAY_MS, revokedAt: null },
    InviteState.Accepted,
  ],
  ['revoked wins over expired', { expiresAt: NOW - 1, acceptedAt: null, revokedAt: NOW - DAY_MS }, InviteState.Revoked],
])('%s', (_name, timestamps, expected) => {
  expect(inviteStateOf({ now: NOW, ...timestamps })).toBe(expected);
});

test('the invite token is read from an invite URL', () => {
  expect(inviteTokenOf('https://app.example/sign-up?invite=abc')).toBe('abc');
});

test('a URL without an invite token is an error, never an empty token', () => {
  expect(() => inviteTokenOf('https://app.example/sign-up')).toThrow(MissingInviteTokenError);
});
