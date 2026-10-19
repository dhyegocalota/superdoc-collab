import { HOUR_MS } from './constants';

export const ACCOUNT_ARCHIVED_MESSAGE = 'This account is archived. Ask an admin to restore it.';
export const ARCHIVED_REASON = 'Archived by an admin';
export const CANNOT_ARCHIVE_SELF_MESSAGE = 'You cannot archive your own account.';
export const CANNOT_IMPERSONATE_SELF_MESSAGE = 'You cannot impersonate yourself.';
export const CANNOT_IMPERSONATE_ARCHIVED_MESSAGE = 'An archived account cannot be impersonated.';
export const CANNOT_IMPERSONATE_ADMIN_MESSAGE = 'An admin cannot be impersonated.';
export const IMPERSONATION_SESSION_MS = HOUR_MS;

export enum UserAction {
  Archive = 'archive',
  Restore = 'restore',
  Impersonate = 'impersonate',
}
