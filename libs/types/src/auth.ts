import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MIN_LENGTH = 2;
export const AUTH_ERROR_MESSAGE = 'Invalid email or password.';
export const EMAIL_INVALID_MESSAGE = 'Enter a valid email address.';
export const PASSWORD_TOO_SHORT_MESSAGE = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
export const NAME_RESERVED_MESSAGE = 'This name is reserved for AI clients.';
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

export function isSupportedTimeZone(value: string): boolean {
  return value === UTC_TIME_ZONE || Intl.supportedValuesOf('timeZone').includes(value);
}

const email = z.string().trim().toLowerCase().email(EMAIL_INVALID_MESSAGE);
const password = z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE);

export const signInSchema = z.object({ email, password });

const IGNORED_CHARACTERS = /[\p{Cf}\p{M}\p{Default_Ignorable_Code_Point}\u3164\u2800]/gu;
const RESERVED_NAME_ENDING = /[\p{P}\p{S}\p{Z}]+(.)(.)$/u;
const LOOKALIKES_OF_A = 'a\u0430\u03b1\u13aa\uab7a\u2c80\u2c81\ua4ee\u1d00';
const LOOKALIKES_OF_I = 'il1|\u03b9\u0456\u04cf\u0131\u01c0\ua4f2\u2c92\u2c93\u05c0\u2d4f';

function impersonatesAgent(name: string): boolean {
  const tail = RESERVED_NAME_ENDING.exec(name.normalize('NFKC').replace(IGNORED_CHARACTERS, '').toLowerCase());
  if (!tail) return false;
  const [, first, second] = tail;
  return LOOKALIKES_OF_A.includes(first!) && LOOKALIKES_OF_I.includes(second!);
}

const personName = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH, NAME_TOO_SHORT_MESSAGE)
  .refine((name) => !impersonatesAgent(name), NAME_RESERVED_MESSAGE);

export const signUpSchema = signInSchema.extend({
  name: personName,
  timeZone: z.string().refine(isSupportedTimeZone, INVALID_TIME_ZONE_MESSAGE),
});

export const updateUserSchema = z
  .object({
    name: personName.optional(),
    timeZone: z.string().refine(isSupportedTimeZone, INVALID_TIME_ZONE_MESSAGE).optional(),
  })
  .passthrough();

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SessionUser = { id: string; name: string; email: string; role: UserRole; timeZone: string | null };
export type AdminUser = { id: string; name: string; email: string; role: UserRole; createdAt: number };
