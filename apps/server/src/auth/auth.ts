import { signInSchema, signUpSchema } from '@superdoc-collab/types';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { Environment } from '../config/environment';
import type { AuthDatabase } from '../database/connection';
import * as authSchema from '../database/schema/auth';
import { CLIENT_ADDRESS_HEADER } from '../http/client-address';

const RATE_LIMIT_WINDOW_SECONDS = 10;
const RATE_LIMIT_MAX_REQUESTS = 100;
const SIGN_IN_PATH = '/sign-in/email';
const SIGN_UP_PATH = '/sign-up/email';
const INVALID_INPUT_MESSAGE = 'Invalid input.';

const credentialSchemas: Record<string, typeof signInSchema> = {
  [SIGN_IN_PATH]: signInSchema,
  [SIGN_UP_PATH]: signUpSchema,
};

const normalizeCredentials = createAuthMiddleware(async (context) => {
  const schema = credentialSchemas[context.path];
  if (!schema) return;
  const parsed = schema.safeParse(context.body);
  if (!parsed.success) throw new APIError('BAD_REQUEST', { message: INVALID_INPUT_MESSAGE });
  return { context: { ...context, body: { ...context.body, ...parsed.data } } };
});

const omitSessionToken = createAuthMiddleware(async (context) => {
  if (!(context.path in credentialSchemas)) return;
  const returned = context.context.returned;
  if (!returned || typeof returned !== 'object' || !('token' in returned)) return;
  const { token: _token, ...body } = returned;
  return context.json(body);
});

export function createAuth({ database, environment }: { database: AuthDatabase; environment: Environment }) {
  return betterAuth({
    secret: environment.authSecret,
    baseURL: environment.appOrigin,
    trustedOrigins: [environment.appOrigin],
    database: drizzleAdapter(database.drizzle, { provider: 'sqlite', schema: authSchema }),
    emailAndPassword: { enabled: true },
    hooks: { before: normalizeCredentials, after: omitSessionToken },
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] } },
    rateLimit: { enabled: true, window: RATE_LIMIT_WINDOW_SECONDS, max: RATE_LIMIT_MAX_REQUESTS },
  });
}

export type Auth = ReturnType<typeof createAuth>;
