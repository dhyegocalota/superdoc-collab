import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MIN_LENGTH = 2;
export const AUTH_ERROR_MESSAGE = 'Invalid email or password.';
export const EMAIL_INVALID_MESSAGE = 'Enter a valid email address.';
export const PASSWORD_TOO_SHORT_MESSAGE = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
export const NAME_RESERVED_MESSAGE = 'This name is reserved for AI clients.';
export const NAME_TOO_SHORT_MESSAGE = `Use at least ${NAME_MIN_LENGTH} characters.`;

const email = z.string().trim().toLowerCase().email(EMAIL_INVALID_MESSAGE);
const password = z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE);

export const signInSchema = z.object({ email, password });
const DOT_LIKE_SEPARATORS = '·•⋅∙・.';
const RESERVED_NAME_ENDING = new RegExp(`[${DOT_LIKE_SEPARATORS}]\\s*a[il]$`);

function impersonatesAgent(name: string): boolean {
  return RESERVED_NAME_ENDING.test(name.normalize('NFKC').toLowerCase());
}

export const signUpSchema = signInSchema.extend({
  name: z
    .string()
    .trim()
    .min(NAME_MIN_LENGTH, NAME_TOO_SHORT_MESSAGE)
    .refine((name) => !impersonatesAgent(name), NAME_RESERVED_MESSAGE),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SessionUser = { id: string; name: string; email: string };
