import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MIN_LENGTH = 2;
export const AUTH_ERROR_MESSAGE = 'Invalid email or password.';

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(PASSWORD_MIN_LENGTH);

export const signInSchema = z.object({ email, password });
export const signUpSchema = signInSchema.extend({ name: z.string().trim().min(NAME_MIN_LENGTH) });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
