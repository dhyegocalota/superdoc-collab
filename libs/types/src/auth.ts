import { z } from 'zod';
import { DATE_TIME_LOCALE } from './constants';

const PASSWORD_MIN_LENGTH = 8;
const NAME_MIN_LENGTH = 2;
export const AUTH_ERROR_MESSAGE = 'Invalid email or password.';
export const EMAIL_INVALID_MESSAGE = 'Enter a valid email address.';
export const PASSWORD_TOO_SHORT_MESSAGE = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
export const NAME_TOO_SHORT_MESSAGE = `Use at least ${NAME_MIN_LENGTH} characters.`;
export const INVALID_TIME_ZONE_MESSAGE = 'Unknown time zone.';
export const SIGN_UP_BY_INVITATION_MESSAGE = 'Sign-up is by invitation. Ask an admin for a link.';
export const ADMINS_ONLY_MESSAGE = 'Admins only.';
export const LAST_ADMIN_MESSAGE = 'The last admin cannot be demoted.';

export const UTC_TIME_ZONE = 'UTC';

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}

export enum TimeZoneSource {
  Account = 'account',
  Browser = 'browser',
}

const TIME_ZONE_MAX_LENGTH = 64;
const OFFSET_TIME_ZONE_PATTERN = /^[+-]/;

function isResolvableTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(DATE_TIME_LOCALE, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isSupportedTimeZone(value: string): boolean {
  if (value.length > TIME_ZONE_MAX_LENGTH) return false;
  if (OFFSET_TIME_ZONE_PATTERN.test(value)) return false;
  return isResolvableTimeZone(value);
}

export function canonicalTimeZone(value: string): string {
  return new Intl.DateTimeFormat(DATE_TIME_LOCALE, { timeZone: value }).resolvedOptions().timeZone;
}

const email = z.string().trim().toLowerCase().email(EMAIL_INVALID_MESSAGE);
const password = z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE);

export const signInSchema = z.object({ email, password });

const personName = z.string().trim().min(NAME_MIN_LENGTH, NAME_TOO_SHORT_MESSAGE);

export const signUpSchema = signInSchema.extend({
  name: personName,
  timeZone: z.string().refine(isSupportedTimeZone, INVALID_TIME_ZONE_MESSAGE).transform(canonicalTimeZone),
});

export const updateUserSchema = z
  .object({
    name: personName.optional(),
    timeZone: z.string().refine(isSupportedTimeZone, INVALID_TIME_ZONE_MESSAGE).transform(canonicalTimeZone).optional(),
  })
  .passthrough();

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SessionUser = { id: string; name: string; email: string; role: UserRole; timeZone: string | null };
export type AdminUser = { id: string; name: string; email: string; role: UserRole; createdAt: number };
