import { DAY_MS } from './constants';

export const INVITE_TTL_MS = 7 * DAY_MS;
export const INVITE_TOKEN_HEADER = 'x-invite-token';
export const INVITE_QUERY_PARAMETER = 'invite';
export const INVITE_NOT_FOUND_MESSAGE = 'This invite is not valid.';
export const INVITE_ALREADY_ACCEPTED_MESSAGE = 'An accepted invite cannot be revoked.';

export enum InviteState {
  Pending = 'pending',
  Accepted = 'accepted',
  Revoked = 'revoked',
  Expired = 'expired',
}

export type InviteStatus = { state: InviteState };
export type SetupStatus = { claimed: boolean };
export type CreatedInvite = { id: string; url: string; expiresAt: number };
export type InviteSummary = {
  id: string;
  state: InviteState;
  createdAt: number;
  expiresAt: number;
  createdBy: { name: string };
  acceptedBy: { name: string } | null;
};

export class MissingInviteTokenError extends Error {
  constructor(url: string) {
    super(`No invite token in ${url}.`);
  }
}

export function inviteTokenOf(url: string): string {
  const token = new URL(url).searchParams.get(INVITE_QUERY_PARAMETER);
  if (!token) throw new MissingInviteTokenError(url);
  return token;
}

export function inviteStateOf({
  now,
  expiresAt,
  acceptedAt,
  revokedAt,
}: {
  now: number;
  expiresAt: number;
  acceptedAt: number | null;
  revokedAt: number | null;
}): InviteState {
  if (revokedAt !== null) return InviteState.Revoked;
  if (acceptedAt !== null) return InviteState.Accepted;
  if (expiresAt <= now) return InviteState.Expired;
  return InviteState.Pending;
}
