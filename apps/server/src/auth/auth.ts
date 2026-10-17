import { mcp } from '@better-auth/mcp';
import {
  AgentScope,
  ApiPath,
  AppRoute,
  OFFLINE_ACCESS_SCOPE,
  signInSchema,
  signUpSchema,
  updateUserSchema,
  UserRole,
} from '@superdoc-collab/types';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { admin, jwt } from 'better-auth/plugins';
import type { InvitesRepository } from '../admin/invites';
import type { Environment } from '../config/environment';
import { createSignUpGate, SIGN_UP_PATH } from './sign-up-gate';
import type { AuthDatabase } from '../database/connection';
import * as authSchema from '../database/schema/auth';
import { CLIENT_ADDRESS_HEADER } from '../http/client-address';

const RATE_LIMIT_WINDOW_SECONDS = 10;
const RATE_LIMIT_MAX_REQUESTS = 100;
const SIGN_IN_PATH = '/sign-in/email';
const UPDATE_USER_PATH = '/update-user';
const INVALID_INPUT_MESSAGE = 'Invalid input.';
const AUTHORIZE_PATH = '/oauth2/authorize';
const TOKEN_PATH = '/oauth2/token';
const OAUTH_SCOPES = [...Object.values(AgentScope), OFFLINE_ACCESS_SCOPE];

const credentialSchemas: Record<string, typeof signInSchema> = {
  [SIGN_IN_PATH]: signInSchema,
  [SIGN_UP_PATH]: signUpSchema,
};

const bodySchemas: Record<string, typeof signInSchema | typeof updateUserSchema> = {
  ...credentialSchemas,
  [UPDATE_USER_PATH]: updateUserSchema,
};

const normalizeCredentials = createAuthMiddleware(async (context) => {
  const schema = bodySchemas[context.path];
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

export function createAuth({
  database,
  environment,
  invites,
}: {
  database: AuthDatabase;
  environment: Environment;
  invites: InvitesRepository;
}) {
  return betterAuth({
    secret: environment.authSecret,
    baseURL: environment.appOrigin,
    trustedOrigins: [environment.appOrigin],
    database: drizzleAdapter(database.drizzle, { provider: 'sqlite', schema: authSchema }),
    emailAndPassword: { enabled: true },
    plugins: [
      admin({ defaultRole: UserRole.User, adminRoles: [UserRole.Admin] }),
      createSignUpGate({ invites, database }),
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
    user: { additionalFields: { timeZone: { type: 'string', required: true, input: true } } },
    hooks: { before: normalizeCredentials, after: omitSessionToken },
    advanced: { disableOriginCheck: false, ipAddress: { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] } },
    rateLimit: { enabled: true, window: RATE_LIMIT_WINDOW_SECONDS, max: RATE_LIMIT_MAX_REQUESTS },
  });
}

export type Auth = ReturnType<typeof createAuth>;
