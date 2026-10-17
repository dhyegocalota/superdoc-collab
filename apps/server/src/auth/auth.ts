import { mcp } from '@better-auth/mcp';
import { AgentScope, ApiPath, AppRoute, signInSchema, signUpSchema } from '@superdoc-history/types';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import type { Environment } from '../config/environment';
import type { AuthDatabase } from '../database/connection';
import * as authSchema from '../database/schema/auth';
import { CLIENT_ADDRESS_HEADER } from '../http/client-address';

const RATE_LIMIT_WINDOW_SECONDS = 10;
const RATE_LIMIT_MAX_REQUESTS = 100;
const SIGN_IN_PATH = '/sign-in/email';
const SIGN_UP_PATH = '/sign-up/email';
const INVALID_INPUT_MESSAGE = 'Invalid input.';
const REFRESH_SCOPE = 'offline_access';
const AUTHORIZE_PATH = '/oauth2/authorize';
const TOKEN_PATH = '/oauth2/token';
const OAUTH_SCOPES = [...Object.values(AgentScope), REFRESH_SCOPE];

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

export function mcpResourceOf(appOrigin: string): string {
  return `${appOrigin}${ApiPath.Mcp}`;
}

function defaultResourcePlugin(resource: string) {
  const supplyResource = createAuthMiddleware(async (context) => {
    if (context.path === AUTHORIZE_PATH && !context.query?.resource) {
      return { context: { ...context, query: { ...context.query, resource } } };
    }
    if (context.path === TOKEN_PATH && !context.body?.resource) {
      return { context: { ...context, body: { ...context.body, resource } } };
    }
  });
  return {
    id: 'default-mcp-resource',
    hooks: {
      before: [
        {
          matcher: (context: { path?: string }) => context.path === AUTHORIZE_PATH || context.path === TOKEN_PATH,
          handler: supplyResource,
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

export function createAuth({ database, environment }: { database: AuthDatabase; environment: Environment }) {
  return betterAuth({
    secret: environment.authSecret,
    baseURL: environment.appOrigin,
    trustedOrigins: [environment.appOrigin],
    database: drizzleAdapter(database.drizzle, { provider: 'sqlite', schema: authSchema }),
    emailAndPassword: { enabled: true },
    plugins: [
      jwt({ jwt: { issuer: environment.appOrigin, audience: mcpResourceOf(environment.appOrigin) }, disableSettingJwtHeader: true }),
      defaultResourcePlugin(mcpResourceOf(environment.appOrigin)),
      mcp({
        loginPage: AppRoute.SignIn,
        consentPage: AppRoute.OAuthConsent,
        resource: mcpResourceOf(environment.appOrigin),
        scopes: OAUTH_SCOPES,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: 'infer',
      }),
    ],
    hooks: { before: normalizeCredentials, after: omitSessionToken },
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] } },
    rateLimit: { enabled: true, window: RATE_LIMIT_WINDOW_SECONDS, max: RATE_LIMIT_MAX_REQUESTS },
  });
}

export type Auth = ReturnType<typeof createAuth>;
