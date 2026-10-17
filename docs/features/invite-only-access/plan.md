# Invite-only access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the first account claims a fresh instance as admin, every later account needs a single-use invite link generated on `/admin`, every account stores the browser's time zone, production seeds nothing, and the README tells a newcomer or an agent how to install and claim.

**Architecture:** Better Auth's `admin` plugin provides `user.role`; its own `/api/auth/admin/*` endpoints are closed at the Hono layer. A local Better Auth plugin (`sign-up-gate`) with `matcher`-based hooks on `/sign-up/email` lets a claim through when no user exists or a pending invite arrives in the `x-invite-token` header; its `after` hook makes the earliest user admin or consumes the invite, and deletes the fresh user otherwise. Invites are a table in `auth.sqlite` with hashed tokens, served by `InvitesRepository` and three route modules (`/api/setup`, `/api/invites/:token`, `/api/admin/*`). The web gains a setup query, an invite query, two sign-up states, a browser-zone capture and an `/admin` page.

**Tech Stack:** Hono, Better Auth 1.7 (`admin` plugin, `additionalFields`, plugin hooks), Drizzle + better-sqlite3 + drizzle-kit migrations, zod, React 19, TanStack Query, react-router, shadcn/ui (dialog, input, table), sonner, Vitest, Playwright, tsup.

**Spec:** `docs/features/invite-only-access/spec.md` (ADR 0020)

**Seam:** `createAuth` plugins (`apps/server/src/auth/auth.ts`), `createApp` route mounting (`apps/server/src/http/app.ts`), `startServer` (`apps/server/src/server.ts`), `router.tsx` and the two auth pages in `apps/web/src/features/auth/`.

**Assumptions (decided, owner can override):**

- The invite token travels in the `x-invite-token` header, not in the sign-up body.
- Admin is decided by a conditional update (`set role = 'admin' where id = ? and no admin exists`), never by the header or by `createdAt` order (an earliest-row rule lost 3 rounds in 1000 to same-millisecond ties in the plan review's probe); a token on an unclaimed instance is ignored.
- Roles are written with Drizzle in the hook and in the admin route; Better Auth's `admin` endpoints (`/api/auth/admin/*`: impersonate, create-user, set-role, set-user-password, remove-user, ban, …) are answered 404 before `auth.handler`, and the web never installs `adminClient`.
- The E2E suite runs against a seeded, claimed stack; the claim is pinned by real-HTTP server tests and by the Playwright MCP walk on the deployed instance.
- The test server claims itself with `admin@example.com` only when the database has no user, and signs the existing admin in otherwise, so restart tests keep working.
- Migration `0004` is generated with `drizzle-kit generate` from the hand-edited schema (verified: additive `ALTER`s plus `CREATE TABLE invites`, no table rebuild).
- The CI smoke container keeps `SEED_DEMO_USERS=true`: the seed claims the instance and Ana's sign-in keeps working, because sign-in is not gated.

## Global Constraints

- No comments except `// NB ADR NNNN:` pointers; flat `if`s; early returns; no `else`; no `?? default`; enums over literals; constants at the top of the file or in `libs/types`; named parameters for more than one parameter; array methods over loops; no `.js` imports.
- Every task commits its failing test first (the red commit right after the test is seen failing) and the implementation second (the green commit after the tests pass); Conventional Commits; never commit from `main`; branch `feat/invite-only-access`.
- Errors are `{ error: string }` with `HttpStatus`; creation answers `201`; deletion answers `204`.
- Times are epoch milliseconds end to end; the web renders them with `formatTimestamp` in the reader's zone.
- Copy in English; messages and labels are exported constants, never inline strings in JSX or handlers.
- Prettier (`pnpm format:check`) green before every commit; `pnpm typecheck` green for the package being changed before every commit, and for the whole workspace again from Task 7 on (Task 1 changes `SessionUser`, which the server fixes in Task 2 and the web fixtures in Task 7; CI runs on the pull request).

## Review Focus

1. A sign-up whose `x-invite-token` was pending at page load but consumed before the `after` hook must answer 403 and leave no user row (Task 4, deterministic test with `accept` mocked to `false`, plus the concurrent test).
2. Two sign-ups racing on an empty instance must yield exactly one admin even on a same-millisecond `createdAt` tie, and a token sent on an unclaimed instance must not turn the claim into a 403 (Task 4).
3. No request, signed in as admin or not, can reach Better Auth's `/api/auth/admin/*` endpoints, and neither the sign-up body nor `/update-user` can set `role` (Task 5).
4. The last admin cannot be demoted by anyone, including through concurrent demotions (Task 5).
5. The sign-up page opened with a dead link must never render the form; a 403 on submit must show the server's sentence; the generated invite URL must be visible even without a clipboard (Tasks 7 and 8).

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 types | `libs/types/src/auth.ts`, `libs/types/src/invites.ts` (new), `libs/types/src/routes.ts`, `libs/types/src/constants.ts`, `libs/types/src/demo-users.ts`, `libs/types/src/index.ts`, `libs/types/src/routes.test.ts`, `libs/types/src/invites.test.ts` (new), `libs/types/src/auth.test.ts` | developer-1 |
| G2 server | `apps/server/src/auth/*`, `apps/server/src/admin/*` (new), `apps/server/src/http/app.ts`, `apps/server/src/http/require-admin.ts` (new), `apps/server/src/http/app.test.ts`, `apps/server/src/server.ts`, `apps/server/src/server.test.ts`, `apps/server/src/database/schema/auth.ts`, `apps/server/src/database/schema/invites.ts` (new), `apps/server/drizzle/0004_*`, `apps/server/better-auth.config.ts`, `apps/server/tsup.config.ts`, `apps/server/package.json`, `apps/server/src/documents/share-links.ts`, `apps/server/src/documents/share-links.test.ts`, `apps/server/src/testing/test-server.ts`, `apps/server/src/seed.ts`, `apps/server/src/repository-shape/*.test.ts` | developer-2 |
| G3 web | `apps/web/src/features/auth/*`, `apps/web/src/features/admin/*` (new), `apps/web/src/lib/browser-time-zone.ts` (new), `apps/web/src/app/router.tsx`, `apps/web/src/features/documents/documents-page.tsx`, `apps/web/src/testing/render-with-providers.tsx`, every `apps/web/src/**/*.test.tsx` fixture that builds a `SessionUser` | developer-3 |
| G4 e2e + delivery | `e2e/fixtures.ts`, `e2e/auth.spec.ts`, `e2e/admin.spec.ts` (new), `.env.example`, `deploy/docker-compose.yml`, `docker-compose.yml`, `docs/features/deploy/runbook-railway.md`, `docs/features/deploy/runbook.md`, `README.md`, `docs/features/invite-only-access/tester-briefing.md` | developer-4 |

## Sequencing

G1 first. G2 and G3 in parallel after G1 (G3 mocks `fetch`). G4 after G2 and G3 are on the branch. Within G2: Tasks 2 → 3 → 4 → 5 → 6. Within G3: Task 7 → Task 8.

---

### Task 1: Shared types, enums, routes, schemas and messages (G1)

**Files:**
- Modify: `libs/types/src/auth.ts`, `libs/types/src/routes.ts`, `libs/types/src/constants.ts`, `libs/types/src/demo-users.ts`, `libs/types/src/index.ts`
- Create: `libs/types/src/invites.ts`
- Test: `libs/types/src/invites.test.ts` (new), `libs/types/src/routes.test.ts`, `libs/types/src/auth.test.ts`

**Interfaces (produces):**
- `enum UserRole { Admin = 'admin', User = 'user' }`
- `type SessionUser = { id: string; name: string; email: string; role: UserRole; timeZone: string | null }`
- `type AdminUser = { id: string; name: string; email: string; role: UserRole; createdAt: number }`
- `const SIGN_UP_BY_INVITATION_MESSAGE = 'Sign-up is by invitation. Ask an admin for a link.'`
- `const INVALID_TIME_ZONE_MESSAGE = 'Unknown time zone.'`; `function isSupportedTimeZone(value: string): boolean`
- `signUpSchema` gains `timeZone: z.string().refine(isSupportedTimeZone, INVALID_TIME_ZONE_MESSAGE)`; `SignUpInput` follows
- `const INVITE_TOKEN_HEADER = 'x-invite-token'`, `const INVITE_QUERY_PARAMETER = 'invite'`, `const INVITE_TTL_MS = 7 * DAY_MS`, `const DAY_MS = 24 * HOUR_MS` (in `constants.ts`)
- `enum InviteState { Pending = 'pending', Accepted = 'accepted', Revoked = 'revoked', Expired = 'expired' }`
- `function inviteStateOf({ now, expiresAt, acceptedAt, revokedAt })`
- `type InviteSummary`, `type CreatedInvite = { id: string; url: string; expiresAt: number }`, `type SetupStatus = { claimed: boolean }`, `type InviteStatus = { state: InviteState }`
- messages: `ADMINS_ONLY_MESSAGE = 'Admins only.'`, `LAST_ADMIN_MESSAGE = 'The last admin cannot be demoted.'`, `INVITE_ALREADY_ACCEPTED_MESSAGE = 'An accepted invite cannot be revoked.'`, `INVITE_NOT_FOUND_MESSAGE = 'This invite is not valid.'`
- routes: `AppRoute.Admin = '/admin'`; `ApiPath.Setup = '/api/setup'`, `ApiPath.Invites = '/api/invites'`, `ApiPath.Admin = '/api/admin'`; `enum AdminResource { Users = 'users', Invites = 'invites' }`; `inviteApiPath(token)`, `adminApiPath(resource)`, `signUpPagePath(token)`
- `DEMO_ADMIN = { name: 'Admin', email: 'admin@example.com' }` next to `DEMO_USERS`

- [x] **Step 1: Write the failing tests**

`libs/types/src/invites.test.ts`:

```ts
import { expect, test } from 'vitest';
import { DAY_MS } from './constants';
import { INVITE_TTL_MS, InviteState, inviteStateOf } from './invites';

const NOW = Date.UTC(2026, 9, 17, 12, 0);

test('the invite lifetime is seven days', () => {
  expect(INVITE_TTL_MS).toBe(7 * DAY_MS);
});

test.each([
  ['pending', { expiresAt: NOW + DAY_MS, acceptedAt: null, revokedAt: null }, InviteState.Pending],
  ['accepted', { expiresAt: NOW + DAY_MS, acceptedAt: NOW - 1, revokedAt: null }, InviteState.Accepted],
  ['revoked', { expiresAt: NOW + DAY_MS, acceptedAt: null, revokedAt: NOW - 1 }, InviteState.Revoked],
  ['expired', { expiresAt: NOW - 1, acceptedAt: null, revokedAt: null }, InviteState.Expired],
  ['accepted before expiry stays accepted after it', { expiresAt: NOW - 1, acceptedAt: NOW - DAY_MS, revokedAt: null }, InviteState.Accepted],
  ['revoked wins over expired', { expiresAt: NOW - 1, acceptedAt: null, revokedAt: NOW - DAY_MS }, InviteState.Revoked],
])('%s', (_name, timestamps, expected) => {
  expect(inviteStateOf({ now: NOW, ...timestamps })).toBe(expected);
});

test('an invite expiring exactly now is expired', () => {
  expect(inviteStateOf({ now: NOW, expiresAt: NOW, acceptedAt: null, revokedAt: null })).toBe(InviteState.Expired);
});
```

Append to `routes.test.ts`:

```ts
test('invite and admin paths encode their parameters', () => {
  expect(inviteApiPath('a b')).toBe('/api/invites/a%20b');
  expect(adminApiPath(AdminResource.Users)).toBe('/api/admin/users');
  expect(adminApiPath(AdminResource.Invites)).toBe('/api/admin/invites');
  expect(signUpPagePath('x/y')).toBe('/sign-up?invite=x%2Fy');
});
```

Append to `auth.test.ts`:

```ts
test('sign-up requires a known IANA time zone', () => {
  const base = { name: 'Eve', email: 'eve@example.com', password: 'long-enough-password' };
  expect(signUpSchema.safeParse({ ...base, timeZone: 'America/Sao_Paulo' }).success).toBe(true);
  const rejected = signUpSchema.safeParse({ ...base, timeZone: 'Mars/Olympus' });
  expect(rejected.success).toBe(false);
  expect(rejected.error?.issues[0]?.message).toBe(INVALID_TIME_ZONE_MESSAGE);
  expect(signUpSchema.safeParse(base).success).toBe(false);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @superdoc-collab/types exec vitest run`
Expected: FAIL with `Cannot find module './invites'`, `inviteApiPath is not defined`, and the time-zone assertion.

- [x] **Step 3: Commit red**

```bash
git add libs/types/src/invites.test.ts libs/types/src/routes.test.ts libs/types/src/auth.test.ts
git commit -m "test(types): pin invite states, invite paths and the sign-up time zone"
```

- [x] **Step 4: Implement**

`libs/types/src/invites.ts`:

```ts
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
```

`libs/types/src/auth.ts` additions (replace the `SessionUser` line, extend `signUpSchema`):

```ts
export const SIGN_UP_BY_INVITATION_MESSAGE = 'Sign-up is by invitation. Ask an admin for a link.';
export const INVALID_TIME_ZONE_MESSAGE = 'Unknown time zone.';
export const ADMINS_ONLY_MESSAGE = 'Admins only.';
export const LAST_ADMIN_MESSAGE = 'The last admin cannot be demoted.';

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}

export function isSupportedTimeZone(value: string): boolean {
  return Intl.supportedValuesOf('timeZone').includes(value);
}

export const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(NAME_MIN_LENGTH, NAME_TOO_SHORT_MESSAGE),
  timeZone: z.string().refine(isSupportedTimeZone, INVALID_TIME_ZONE_MESSAGE),
});

export type SessionUser = { id: string; name: string; email: string; role: UserRole; timeZone: string | null };
export type AdminUser = { id: string; name: string; email: string; role: UserRole; createdAt: number };
```

`libs/types/src/routes.ts`: add `Admin = '/admin'` to `AppRoute`; `Setup`, `Invites`, `Admin` to `ApiPath`; and:

```ts
export enum AdminResource {
  Users = 'users',
  Invites = 'invites',
}

export function inviteApiPath(token: string): string {
  return `${ApiPath.Invites}/${encodeURIComponent(token)}`;
}

export function adminApiPath(resource: AdminResource): string {
  return `${ApiPath.Admin}/${resource}`;
}

export function signUpPagePath(token: string): string {
  return `${AppRoute.SignUp}?${INVITE_QUERY_PARAMETER}=${encodeURIComponent(token)}`;
}
```

`constants.ts`: `export const DAY_MS = 24 * HOUR_MS;`. `demo-users.ts`: `export const DEMO_ADMIN = { name: 'Admin', email: 'admin@example.com' };`. `index.ts`: `export * from './invites';`.

- [x] **Step 5: Run the tests and typecheck the package**

Run: `pnpm --filter @superdoc-collab/types exec vitest run && pnpm --filter @superdoc-collab/types typecheck`
Expected: PASS. (`pnpm typecheck` at the root now lists the `SessionUser` consumers in server and web; record them in the commit body.)

- [x] **Step 6: Commit green**

```bash
git add libs/types/src/auth.ts libs/types/src/invites.ts libs/types/src/routes.ts libs/types/src/constants.ts libs/types/src/demo-users.ts libs/types/src/index.ts
git commit -m "feat(types): user roles, invite states, admin and invite paths, time zone on sign-up"
```

---

### Task 2: Schema, migration, admin plugin, role and zone in the session, shared token hash (G2)

**Files:**
- Modify: `apps/server/src/database/schema/auth.ts`, `apps/server/src/auth/auth.ts` (plugin and `additionalFields` only), `apps/server/better-auth.config.ts`, `apps/server/src/auth/session.ts`, `apps/server/src/documents/share-links.ts`
- Create: `apps/server/src/database/schema/invites.ts`, `apps/server/src/auth/token-hash.ts`, `apps/server/drizzle/0004_invite-only-access.sql` (generated) + snapshot + journal entry
- Test: `apps/server/src/auth/token-hash.test.ts` (new), `apps/server/src/auth/session.test.ts`, `apps/server/src/documents/share-links.test.ts` (hash test moves out)

**Interfaces (produces):**
- `authSchema.user`: `timeZone: text('time_zone')` (nullable), `role: text('role', { enum: [UserRole.Admin, UserRole.User] }).notNull().default(UserRole.User)`, `banned: integer('banned', { mode: 'boolean' }).notNull().default(false)`, `banReason: text('ban_reason')`, `banExpires: integer('ban_expires', { mode: 'timestamp_ms' })`; `authSchema.session.impersonatedBy: text('impersonated_by')`.
- `invites` table as in the spec.
- `hashToken(token: string): string` (sha256 hex) in `auth/token-hash.ts`; `share-links.ts` imports it.
- `readSession` returns `role` and `timeZone`; throws `SessionUserWithoutRoleError` when the role is missing.

- [x] **Step 1: Write the failing tests**

`apps/server/src/auth/token-hash.test.ts`:

```ts
import { expect, test } from 'vitest';
import { hashToken } from './token-hash';

const HEX_DIGEST_LENGTH = 64;

test('a token hashes to 64 hex characters that differ from it', () => {
  const hash = hashToken('nonce-one');
  expect(hash).toMatch(new RegExp(`^[0-9a-f]{${HEX_DIGEST_LENGTH}}$`));
  expect(hash).not.toBe('nonce-one');
});

test('hashing is deterministic', () => {
  expect(hashToken('a')).toBe(hashToken('a'));
});
```

Append to `session.test.ts` (uses `signedInOwner` from the test server; after Task 4 the owner is an invited user):

```ts
test('the session user carries role and time zone', async () => {
  const { server, owner } = await signedInOwner();
  const user = await readSession({ auth: server.auth, headers: new Headers({ cookie: owner.cookie }) });
  expect(user).toMatchObject({ role: UserRole.User, timeZone: 'UTC' });
  await server.stop();
});

test('a session whose user has no role is an error, never a default', async () => {
  const { server, owner } = await signedInOwner();
  server.database.sqlite.prepare("update user set role = '' where id = ?").run(owner.id);
  await expect(readSession({ auth: server.auth, headers: new Headers({ cookie: owner.cookie }) })).rejects.toThrow(SessionUserWithoutRoleError);
  await server.stop();
});
```

- [x] **Step 2: Run the tests to verify they fail** — `Cannot find module './token-hash'`; `role` undefined.

- [x] **Step 3: Commit red** — `test(server): pin the shared token hash and the session role and time zone`.

- [x] **Step 4: Implement**

Schema: add the columns to `user` and `session` as in Interfaces (`UserRole` from `@superdoc-collab/types`). `schema/invites.ts`:

```ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  acceptedBy: text('accepted_by').references(() => user.id, { onDelete: 'set null' }),
  acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
});
```

Migration: `cd apps/server && pnpm exec drizzle-kit generate --name invite-only-access && cd ../..`; check the SQL holds `ALTER TABLE \`user\` ADD \`time_zone\``, `ADD \`role\` ... DEFAULT 'user' NOT NULL`, the ban columns, `ALTER TABLE \`session\` ADD \`impersonated_by\`` and `CREATE TABLE \`invites\``, and no `__new_user`. Add the drizzle schema export of `invites` wherever `authSchema` is assembled for the adapter (the adapter needs `invites` only if Better Auth should see it; it does not, so leave it out of the adapter's `schema`).

`auth.ts` (plugin and field only; the gate is Task 4):

```ts
import { admin } from 'better-auth/plugins';
...
    plugins: [admin({ defaultRole: UserRole.User, adminRoles: [UserRole.Admin] })],
    user: { additionalFields: { timeZone: { type: 'string', required: true, input: true } } },
```

`better-auth.config.ts`: the same two lines.

`session.ts`:

```ts
export class SessionUserWithoutRoleError extends Error {
  constructor(userId: string) {
    super(`Session user ${userId} has no role.`);
  }
}

function roleOf({ userId, role }: { userId: string; role: string | null | undefined }): UserRole {
  if (role === UserRole.Admin) return UserRole.Admin;
  if (role === UserRole.User) return UserRole.User;
  throw new SessionUserWithoutRoleError(userId);
}

function timeZoneOf(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value;
}

export async function readSession({ auth, headers }: { auth: Auth; headers: Headers }): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, name, email, role, timeZone } = session.user;
  return { id, name, email, role: roleOf({ userId: id, role }), timeZone: timeZoneOf(timeZone) };
}
```

`token-hash.ts`:

```ts
import { createHash } from 'node:crypto';

const TOKEN_DIGEST = 'sha256';

export function hashToken(token: string): string {
  return createHash(TOKEN_DIGEST).update(token).digest('hex');
}
```

`share-links.ts`: remove `hashShareToken`, import `hashToken`, replace the three call sites; keep `deriveShareToken`. Move the hash test out of `share-links.test.ts`.

- [x] **Step 5: Run the tests and typecheck the server**

Run: `pnpm --filter @superdoc-collab/server exec vitest run src/auth src/documents/share-links.test.ts src/documents/share-links-routes.test.ts && pnpm --filter @superdoc-collab/server typecheck`
Expected: PASS (the existing `/api/me` `toEqual` assertions in `app.test.ts` and `server.test.ts` are updated in Task 4, when sign-up changes).

- [x] **Step 6: Commit green** — `feat(server): user roles via the admin plugin, time zone on the user, invites table, shared token hash`.

---

### Task 3: InvitesRepository (G2)

**Files:**
- Create: `apps/server/src/admin/invites.ts`
- Test: `apps/server/src/admin/invites.test.ts`

**Interfaces (produces):**

```ts
export enum RevokeOutcome { Revoked = 'revoked', NotFound = 'not-found', AlreadyAccepted = 'already-accepted' }
export class InvitesRepository {
  constructor({ database, appOrigin, now }: { database: AuthDatabase; appOrigin: string; now: () => number });
  hasAnyUser(): boolean;
  create({ createdBy }: { createdBy: string }): CreatedInvite;
  list(): InviteSummary[];                                  // newest first by createdAt, then id
  resolvePending(token: string): { id: string } | null;
  accept({ id, userId }: { id: string; userId: string }): boolean;
  revoke(id: string): RevokeOutcome;
}
```

- [x] **Step 1: Write the failing tests**

```ts
import { DAY_MS, INVITE_TTL_MS, InviteState } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { signedInUser, startTestServer } from '../testing/test-server';
import { InvitesRepository, RevokeOutcome } from './invites';

const NOW = Date.UTC(2026, 9, 17, 12, 0);

async function repositoryWith(now: () => number) {
  const server = await startTestServer();
  const creator = await signedInUser({ server, name: 'Creator' });
  const repository = new InvitesRepository({ database: server.database, appOrigin: server.baseUrl, now });
  return { server, repository, creatorId: creator.id };
}

function tokenOf(url: string): string {
  return new URL(url).searchParams.get('invite') as string;
}

test('create returns a sign-up URL once and stores only the hash', async () => {
  const { server, repository, creatorId } = await repositoryWith(() => NOW);
  const invite = repository.create({ createdBy: creatorId });
  const token = tokenOf(invite.url);
  expect(invite.url.startsWith(`${server.baseUrl}/sign-up?invite=`)).toBe(true);
  expect(invite.expiresAt).toBe(NOW + INVITE_TTL_MS);
  const rows = server.database.sqlite.prepare('select token_hash from invites').all() as { token_hash: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]!.token_hash).not.toContain(token);
  expect(repository.resolvePending(token)).toEqual({ id: invite.id });
  await server.stop();
});

test('an accepted invite stops resolving and accept is single use', async () => {
  const { server, repository, creatorId } = await repositoryWith(() => NOW);
  const invite = repository.create({ createdBy: creatorId });
  expect(repository.accept({ id: invite.id, userId: creatorId })).toBe(true);
  expect(repository.accept({ id: invite.id, userId: creatorId })).toBe(false);
  expect(repository.resolvePending(tokenOf(invite.url))).toBeNull();
  expect(repository.list()[0]?.state).toBe(InviteState.Accepted);
  await server.stop();
});

test('revoke marks a pending invite, refuses an accepted one and reports unknown ids; the list is newest first', async () => {
  const clock = { now: NOW };
  const { server, repository, creatorId } = await repositoryWith(() => clock.now);
  const pending = repository.create({ createdBy: creatorId });
  clock.now += 1000;
  const accepted = repository.create({ createdBy: creatorId });
  repository.accept({ id: accepted.id, userId: creatorId });
  expect(repository.revoke(pending.id)).toBe(RevokeOutcome.Revoked);
  expect(repository.revoke(accepted.id)).toBe(RevokeOutcome.AlreadyAccepted);
  expect(repository.revoke('nope')).toBe(RevokeOutcome.NotFound);
  expect(repository.list().map((invite) => invite.state)).toEqual([InviteState.Accepted, InviteState.Revoked]);
  await server.stop();
});

test('an invite expires after seven days', async () => {
  const clock = { now: NOW };
  const { server, repository, creatorId } = await repositoryWith(() => clock.now);
  const invite = repository.create({ createdBy: creatorId });
  clock.now = NOW + INVITE_TTL_MS;
  expect(repository.resolvePending(tokenOf(invite.url))).toBeNull();
  expect(repository.list()[0]?.state).toBe(InviteState.Expired);
  clock.now = NOW + INVITE_TTL_MS - DAY_MS;
  expect(repository.resolvePending(tokenOf(invite.url))).toEqual({ id: invite.id });
  await server.stop();
});

test('list names the creator and the acceptor', async () => {
  const { server, repository, creatorId } = await repositoryWith(() => NOW);
  const invite = repository.create({ createdBy: creatorId });
  repository.accept({ id: invite.id, userId: creatorId });
  expect(repository.list()[0]).toMatchObject({ createdBy: { name: 'Creator' }, acceptedBy: { name: 'Creator' } });
  await server.stop();
});
```

- [x] **Step 2: Run to verify they fail** — `Cannot find module './invites'`.
- [x] **Step 3: Commit red** — `test(server): pin the invites repository`.
- [x] **Step 4: Implement**

```ts
import { randomBytes, randomUUID } from 'node:crypto';
import { INVITE_TTL_MS, inviteStateOf, signUpPagePath, type CreatedInvite, type InviteSummary } from '@superdoc-collab/types';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { hashToken } from '../auth/token-hash';
import type { AuthDatabase } from '../database/connection';
import { user } from '../database/schema/auth';
import { invites } from '../database/schema/invites';

const TOKEN_BYTES = 32;

export enum RevokeOutcome {
  Revoked = 'revoked',
  NotFound = 'not-found',
  AlreadyAccepted = 'already-accepted',
}

function timeOf(value: Date | null): number | null {
  if (value === null) return null;
  return value.getTime();
}

function acceptorOf(name: string | null): { name: string } | null {
  if (name === null) return null;
  return { name };
}

export class InvitesRepository {
  private readonly database: AuthDatabase;
  private readonly appOrigin: string;
  private readonly now: () => number;

  constructor({ database, appOrigin, now }: { database: AuthDatabase; appOrigin: string; now: () => number }) {
    this.database = database;
    this.appOrigin = appOrigin;
    this.now = now;
  }

  hasAnyUser(): boolean {
    return this.database.drizzle.select({ id: user.id }).from(user).limit(1).get() !== undefined;
  }

  create({ createdBy }: { createdBy: string }): CreatedInvite {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const createdAt = this.now();
    const expiresAt = createdAt + INVITE_TTL_MS;
    const id = randomUUID();
    this.database.drizzle
      .insert(invites)
      .values({ id, tokenHash: hashToken(token), createdBy, createdAt: new Date(createdAt), expiresAt: new Date(expiresAt) })
      .run();
    return { id, url: `${this.appOrigin}${signUpPagePath(token)}`, expiresAt };
  }

  resolvePending(token: string): { id: string } | null {
    const row = this.database.drizzle
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.tokenHash, hashToken(token)), this.pendingCondition()))
      .get();
    if (!row) return null;
    return row;
  }

  accept({ id, userId }: { id: string; userId: string }): boolean {
    const result = this.database.drizzle
      .update(invites)
      .set({ acceptedBy: userId, acceptedAt: new Date(this.now()) })
      .where(and(eq(invites.id, id), this.pendingCondition()))
      .run();
    return result.changes === 1;
  }

  revoke(id: string): RevokeOutcome {
    const row = this.database.drizzle.select({ acceptedAt: invites.acceptedAt }).from(invites).where(eq(invites.id, id)).get();
    if (!row) return RevokeOutcome.NotFound;
    if (row.acceptedAt !== null) return RevokeOutcome.AlreadyAccepted;
    this.database.drizzle.update(invites).set({ revokedAt: new Date(this.now()) }).where(eq(invites.id, id)).run();
    return RevokeOutcome.Revoked;
  }

  list(): InviteSummary[] {
    const creator = alias(user, 'creator');
    const acceptor = alias(user, 'acceptor');
    const now = this.now();
    return this.database.drizzle
      .select({
        id: invites.id,
        createdAt: invites.createdAt,
        expiresAt: invites.expiresAt,
        acceptedAt: invites.acceptedAt,
        revokedAt: invites.revokedAt,
        creatorName: creator.name,
        acceptorName: acceptor.name,
      })
      .from(invites)
      .innerJoin(creator, eq(creator.id, invites.createdBy))
      .leftJoin(acceptor, eq(acceptor.id, invites.acceptedBy))
      .orderBy(desc(invites.createdAt), asc(invites.id))
      .all()
      .map((row) => ({
        id: row.id,
        state: inviteStateOf({ now, expiresAt: row.expiresAt.getTime(), acceptedAt: timeOf(row.acceptedAt), revokedAt: timeOf(row.revokedAt) }),
        createdAt: row.createdAt.getTime(),
        expiresAt: row.expiresAt.getTime(),
        createdBy: { name: row.creatorName },
        acceptedBy: acceptorOf(row.acceptorName),
      }));
  }

  private pendingCondition() {
    return and(isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date(this.now())));
  }
}
```

- [x] **Step 5: Run the tests** — PASS (5).
- [x] **Step 6: Commit green** — `feat(server): invites repository with hashed single-use tokens`.

---

### Task 4: Sign-up gate plugin, claim by earliest user, test-server claim, seed, existing tests (G2)

**Files:**
- Create: `apps/server/src/auth/sign-up-gate.ts`
- Modify: `apps/server/src/auth/auth.ts`, `apps/server/src/server.ts` (`startServer({ now = Date.now })`, builds `InvitesRepository`, passes it to `createAuth` and `services`), `apps/server/src/testing/test-server.ts`, `apps/server/src/auth/seed-demo-users.ts`, `apps/server/src/seed.ts`
- Modify tests that break: `apps/server/src/http/app.test.ts` (sign-up through the helper; `/api/me` `toEqual` gains `role` and `timeZone`; the concurrent sign-ups test uses two invites and expects two users), `apps/server/src/server.test.ts` (`/api/me` `toEqual`), `apps/server/src/auth/seed-demo-users.test.ts` (passes `invites`; `existing` lists `admin@example.com` first)
- Test: `apps/server/src/auth/sign-up-gate.test.ts`

**Interfaces (produces):**
- `createSignUpGate({ invites, database }): BetterAuthPlugin` with id `sign-up-gate`.
- `createAuth({ database, environment, invites })`.
- `startServer({ ..., now = Date.now })`; `services.invites: InvitesRepository`.
- `startTestServer({ claim = true, now = Date.now, ... })`: when `claim` and the database has no user, signs `DEMO_ADMIN` up (no token, `timeZone: TEST_TIME_ZONE`) and in; when `claim` and a user exists, signs the admin in with `signInExisting`; `claim` and `now` are forwarded through the `EADDRINUSE` retry. `TestServer.admin: TestUser` (a getter that throws `NoTestAdminError` when `claim` was false), `TestServer.hasAdmin: boolean`.
- `signInAndGetCookie` adds `timeZone: TEST_TIME_ZONE` to every sign-up body and, when `server.hasAdmin`, the `x-invite-token` header from `server.services.invites.create({ createdBy: server.admin.id })`.
- `seedDemoUsers({ auth, database, invites, password })`: `DEMO_ADMIN` first (claim), then `DEMO_USERS` through invites created only for missing accounts; every body carries `timeZone: SEED_TIME_ZONE = 'UTC'`.

- [x] **Step 1: Write the failing tests**

`apps/server/src/auth/sign-up-gate.test.ts`:

```ts
import { ApiPath, DAY_MS, HttpStatus, INVITE_TOKEN_HEADER, INVITE_TTL_MS, InviteState, SIGN_UP_BY_INVITATION_MESSAGE, UserRole } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { currentUserId, signInExisting, startTestServer, TEST_USER_PASSWORD, type TestServer } from '../testing/test-server';

const TIME_ZONE = 'America/Sao_Paulo';
let clientAddress = 1;

function signUp({ server, email, token, timeZone = TIME_ZONE, extra = {} }: { server: TestServer; email: string; token?: string; timeZone?: string; extra?: Record<string, string> }): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.201.0.${clientAddress++}` };
  if (token) headers[INVITE_TOKEN_HEADER] = token;
  const body = { name: 'Eve', email, password: TEST_USER_PASSWORD, timeZone, ...extra };
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-up/email`, { method: 'POST', headers, body: JSON.stringify(body) });
}

function tokenOf(url: string): string {
  return new URL(url).searchParams.get('invite') as string;
}

function userCount({ server, emails }: { server: TestServer; emails: string[] }): number {
  const placeholders = emails.map(() => '?').join(',');
  const row = server.database.sqlite.prepare(`select count(*) as n from user where email in (${placeholders})`).get(...emails) as { n: number };
  return row.n;
}

async function roleOf({ server, email }: { server: TestServer; email: string }): Promise<string> {
  const cookie = await signInExisting({ server, email, password: TEST_USER_PASSWORD });
  const me = (await (await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie } })).json()) as { user: { role: string; timeZone: string | null } };
  return me.user.role;
}

test('the first sign-up on an unclaimed instance becomes admin and keeps its time zone', async () => {
  const server = await startTestServer({ claim: false });
  expect((await signUp({ server, email: 'first@example.com' })).status).toBe(HttpStatus.Ok);
  const cookie = await signInExisting({ server, email: 'first@example.com', password: TEST_USER_PASSWORD });
  const me = (await (await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie } })).json()) as { user: { role: string; timeZone: string | null } };
  expect(me.user).toMatchObject({ role: UserRole.Admin, timeZone: TIME_ZONE });
  await server.stop();
});

test('a token sent on an unclaimed instance does not spoil the claim', async () => {
  const server = await startTestServer({ claim: false });
  expect((await signUp({ server, email: 'first@example.com', token: 'anything' })).status).toBe(HttpStatus.Ok);
  expect(await roleOf({ server, email: 'first@example.com' })).toBe(UserRole.Admin);
  await server.stop();
});

test('a sign-up without a token on a claimed instance is refused and creates no user', async () => {
  const server = await startTestServer();
  const response = await signUp({ server, email: 'eve@example.com' });
  expect(response.status).toBe(HttpStatus.Forbidden);
  expect(await response.json()).toMatchObject({ message: SIGN_UP_BY_INVITATION_MESSAGE });
  expect(userCount({ server, emails: ['eve@example.com'] })).toBe(0);
  await server.stop();
});

test('a pending token admits a user once, marks the invite accepted, and the user is not admin', async () => {
  const server = await startTestServer();
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  expect((await signUp({ server, email: 'eve@example.com', token: tokenOf(invite.url) })).status).toBe(HttpStatus.Ok);
  expect((await signUp({ server, email: 'eve2@example.com', token: tokenOf(invite.url) })).status).toBe(HttpStatus.Forbidden);
  expect(server.services.invites.list()[0]).toMatchObject({ state: InviteState.Accepted, acceptedBy: { name: 'Eve' } });
  expect(await roleOf({ server, email: 'eve@example.com' })).toBe(UserRole.User);
  await server.stop();
});

test.each(['revoked', 'expired', 'unknown'] as const)('a %s token is refused', async (kind) => {
  const clock = { now: Date.now() };
  const server = await startTestServer({ now: () => clock.now });
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  if (kind === 'revoked') server.services.invites.revoke(invite.id);
  if (kind === 'expired') clock.now += INVITE_TTL_MS + DAY_MS;
  const token = kind === 'unknown' ? 'not-a-token' : tokenOf(invite.url);
  expect((await signUp({ server, email: 'eve@example.com', token })).status).toBe(HttpStatus.Forbidden);
  expect(userCount({ server, emails: ['eve@example.com'] })).toBe(0);
  await server.stop();
});

test('an invite that stops being pending after the gate creates no user', async () => {
  const server = await startTestServer();
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  vi.spyOn(server.services.invites, 'accept').mockReturnValueOnce(false);
  const response = await signUp({ server, email: 'eve@example.com', token: tokenOf(invite.url) });
  expect(response.status).toBe(HttpStatus.Forbidden);
  expect(userCount({ server, emails: ['eve@example.com'] })).toBe(0);
  await server.stop();
});

test('a token used by two concurrent sign-ups admits exactly one', async () => {
  const server = await startTestServer();
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  const token = tokenOf(invite.url);
  const [first, second] = await Promise.all([signUp({ server, email: 'a@example.com', token }), signUp({ server, email: 'b@example.com', token })]);
  expect([first.status, second.status].sort()).toEqual([HttpStatus.Ok, HttpStatus.Forbidden]);
  expect(userCount({ server, emails: ['a@example.com', 'b@example.com'] })).toBe(1);
  await server.stop();
});

test('two concurrent first sign-ups leave exactly one admin and one user, ten rounds', async () => {
  await Array.from({ length: 10 }).reduce(async (previous, _value, round) => {
    await previous;
    const server = await startTestServer({ claim: false });
    const [first, second] = await Promise.all([signUp({ server, email: `a${round}@example.com` }), signUp({ server, email: `b${round}@example.com` })]);
    expect([first.status, second.status].sort()).toEqual([HttpStatus.Ok, HttpStatus.Forbidden]);
    const roles = server.database.sqlite.prepare('select role from user').all() as { role: string }[];
    expect(roles).toEqual([{ role: UserRole.Admin }]);
    await server.stop();
  }, Promise.resolve());
});

test('a sign-up with an unknown time zone is refused before the gate and claims nothing', async () => {
  const server = await startTestServer({ claim: false });
  expect((await signUp({ server, email: 'eve@example.com', timeZone: 'Mars/Olympus' })).status).toBe(HttpStatus.BadRequest);
  expect(server.services.invites.hasAnyUser()).toBe(false);
  await server.stop();
});

test('a sign-up body cannot grant itself the admin role', async () => {
  const server = await startTestServer();
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  const response = await signUp({ server, email: 'eve@example.com', token: tokenOf(invite.url), extra: { role: UserRole.Admin } });
  expect(response.status).toBe(HttpStatus.BadRequest);
  const row = server.database.sqlite.prepare('select role from user where email = ?').get('eve@example.com') as { role: string } | undefined;
  expect(row).toBeUndefined();
  await server.stop();
});

test('a valid sign-in is still normalised by the credentials hook', async () => {
  const server = await startTestServer();
  const cookie = await signInExisting({ server, email: server.admin.email.toUpperCase(), password: TEST_USER_PASSWORD });
  expect(await currentUserId({ server, cookie })).toBe(server.admin.id);
  await server.stop();
});
```

(The last test exists only if `normalizeCredentials` lower-cases the e-mail today; read `signInSchema` first. If it does not, replace it with a sign-in of the admin using an e-mail with surrounding spaces, which the schema trims.)

`seed-demo-users.test.ts`, add:

```ts
test('the seed claims the instance with the admin and admits the demo users by invite', async () => {
  const server = await startTestServer({ claim: false });
  const result = await seedDemoUsers({ auth: server.auth, database: server.database, invites: server.services.invites, password: TEST_USER_PASSWORD });
  expect(result.created[0]).toBe(DEMO_ADMIN.email);
  const rows = server.database.sqlite.prepare('select email, role, time_zone from user order by created_at, id').all() as { email: string; role: string; time_zone: string }[];
  expect(rows[0]).toEqual({ email: DEMO_ADMIN.email, role: UserRole.Admin, time_zone: 'UTC' });
  expect(rows.slice(1).every((row) => row.role === UserRole.User)).toBe(true);
  const invitesBefore = server.services.invites.list().length;
  const again = await seedDemoUsers({ auth: server.auth, database: server.database, invites: server.services.invites, password: TEST_USER_PASSWORD });
  expect(again.created).toEqual([]);
  expect(server.services.invites.list()).toHaveLength(invitesBefore);
  await server.stop();
});
```

- [x] **Step 2: Run to verify they fail** — the claimed-instance test gets 200 where 403 is expected; `startTestServer({ claim: false })` is a type error until implemented (run with `--typecheck` off: vitest ignores the option at runtime).

- [x] **Step 3: Commit red** — `test(server): pin the sign-up gate, the claim and the seed order`.

- [x] **Step 4: Implement the gate as a plugin**

`apps/server/src/auth/sign-up-gate.ts`:

```ts
import { INVITE_TOKEN_HEADER, SIGN_UP_BY_INVITATION_MESSAGE, UserRole } from '@superdoc-collab/types';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, type HookEndpointContext } from 'better-auth/api';
import { and, eq, notExists } from 'drizzle-orm';
import type { InvitesRepository } from '../admin/invites';
import type { AuthDatabase } from '../database/connection';
import { user } from '../database/schema/auth';

export const SIGN_UP_PATH = '/sign-up/email';
const PLUGIN_ID = 'sign-up-gate';

type CreatedUser = { id: string };

function isSignUp(context: HookEndpointContext): boolean {
  return context.path === SIGN_UP_PATH;
}

function inviteTokenOf(headers: Headers | undefined): string | null {
  if (!headers) return null;
  return headers.get(INVITE_TOKEN_HEADER);
}

function createdUserOf(returned: unknown): CreatedUser | null {
  if (!returned || typeof returned !== 'object' || !('user' in returned)) return null;
  const candidate = (returned as { user: unknown }).user;
  if (!candidate || typeof candidate !== 'object' || !('id' in candidate)) return null;
  return candidate as CreatedUser;
}

function claimAdmin({ database, userId }: { database: AuthDatabase; userId: string }): boolean {
  const noAdminExists = notExists(database.drizzle.select({ id: user.id }).from(user).where(eq(user.role, UserRole.Admin)));
  const result = database.drizzle
    .update(user)
    .set({ role: UserRole.Admin })
    .where(and(eq(user.id, userId), noAdminExists))
    .run();
  return result.changes === 1;
}

function refuse({ database, userId }: { database: AuthDatabase; userId: string }): never {
  database.drizzle.delete(user).where(eq(user.id, userId)).run();
  throw new APIError('FORBIDDEN', { message: SIGN_UP_BY_INVITATION_MESSAGE });
}

export function createSignUpGate({ invites, database }: { invites: InvitesRepository; database: AuthDatabase }): BetterAuthPlugin {
  const before = createAuthMiddleware(async (context) => {
    if (!invites.hasAnyUser()) return;
    const token = inviteTokenOf(context.headers);
    if (token && invites.resolvePending(token)) return;
    throw new APIError('FORBIDDEN', { message: SIGN_UP_BY_INVITATION_MESSAGE });
  });

  const after = createAuthMiddleware(async (context) => {
    const created = createdUserOf(context.context.returned);
    if (!created) return;
    if (claimAdmin({ database, userId: created.id })) return;
    const token = inviteTokenOf(context.headers);
    if (!token) refuse({ database, userId: created.id });
    const pending = invites.resolvePending(token);
    if (pending && invites.accept({ id: pending.id, userId: created.id })) return;
    refuse({ database, userId: created.id });
  });

  return {
    id: PLUGIN_ID,
    hooks: {
      before: [{ matcher: isSignUp, handler: before }],
      after: [{ matcher: isSignUp, handler: after }],
    },
  };
}
```

Why a plugin and not `hooks.before`/`hooks.after` composition: Better Auth calls each hook with `returnHeaders: true`, so a composed middleware always receives a `{ headers, response }` wrapper and short-circuits every endpoint (probed by the plan review on 1.7.10). User hooks run before plugin hooks, so `normalizeCredentials` still runs first and the `after` hook sees `returned = { user }` with the token already stripped by `omitSessionToken`. The conditional update is one statement, so two racing claimants cannot both see "no admin" and both write; the loser falls through to the invite path, has no token, and is deleted with 403 (probed 1000 of 1000 rounds in the plan review). Note on the 403 after creation: the session cookie Better Auth already set points at a deleted user; the session row cascades, so the cookie is dead.

`auth.ts`: keep `hooks: { before: normalizeCredentials, after: omitSessionToken }` as is and add the plugin:

```ts
export function createAuth({ database, environment, invites }: { database: AuthDatabase; environment: Environment; invites: InvitesRepository }) {
  return betterAuth({
    ...
    plugins: [admin({ defaultRole: UserRole.User, adminRoles: [UserRole.Admin] }), createSignUpGate({ invites, database })],
```

`server.ts`: `startServer({ environment, webDistDirectory, languageModel = ..., now = Date.now, ... })`; after the auth database opens: `const invites = new InvitesRepository({ database, appOrigin: environment.appOrigin, now });` then `createAuth({ database, environment, invites })`; add `invites` to `services`.

- [x] **Step 5: Test server, seed, existing tests**

`test-server.ts`:

```ts
export const TEST_TIME_ZONE = 'UTC';

export class NoTestAdminError extends Error {
  constructor() {
    super('startTestServer({ claim: false }) has no admin.');
  }
}

async function claimOrSignInAdmin(server: TestServer): Promise<TestUser> {
  const credentials = { ...DEMO_ADMIN, password: TEST_USER_PASSWORD };
  if (!server.services.invites.hasAnyUser()) {
    const signedUp = await postCredentials({ server, path: '/sign-up/email', body: { ...credentials, timeZone: TEST_TIME_ZONE } });
    if (!signedUp.ok) throw new TestSignInFailedError({ step: 'claim', status: signedUp.status });
  }
  const cookie = await signInExisting({ server, email: credentials.email, password: credentials.password });
  return { id: await currentUserId({ server, cookie }), email: credentials.email, cookie };
}
```

`startTestServer({ claim = true, now = Date.now, ... })` passes `now` to `startServer`, forwards `claim` and `now` in the `EADDRINUSE` retry, and after start: `const admin = claim ? await claimOrSignInAdmin(server) : null;` exposing `hasAdmin: admin !== null` and `get admin(): TestUser { if (!admin) throw new NoTestAdminError(); return admin; }`.

`signInAndGetCookie`: `const headers = server.hasAdmin ? { [INVITE_TOKEN_HEADER]: tokenOf(server.services.invites.create({ createdBy: server.admin.id }).url) } : {};` and the body gains `timeZone: TEST_TIME_ZONE`; `postCredentials` accepts `headers` to merge.

`seed-demo-users.ts`:

```ts
const SEED_TIME_ZONE = 'UTC';

async function seedOne({ auth, database, invites, adminId, account, password, result }: { ... }): Promise<string> {
  const found = database.drizzle.select({ id: authSchema.user.id }).from(authSchema.user).where(eq(authSchema.user.email, account.email)).get();
  if (found) {
    result.existing.push(account.email);
    return found.id;
  }
  const headers = adminId === null ? new Headers() : new Headers({ [INVITE_TOKEN_HEADER]: tokenOf(invites.create({ createdBy: adminId }).url) });
  const created = await auth.api.signUpEmail({ body: { ...account, password, timeZone: SEED_TIME_ZONE }, headers });
  result.created.push(account.email);
  return created.user.id;
}

export async function seedDemoUsers({ auth, database, invites, password }): Promise<SeedResult> {
  const result: SeedResult = { created: [], existing: [] };
  const adminId = await seedOne({ auth, database, invites, adminId: null, account: DEMO_ADMIN, password, result });
  await DEMO_USERS.reduce(async (previous, account) => {
    await previous;
    await seedOne({ auth, database, invites, adminId, account, password, result });
  }, Promise.resolve());
  return result;
}
```

`adminId: null` is the explicit "this is the claim" case, not a default. `seed.ts` builds `InvitesRepository({ database, appOrigin: environment.appOrigin, now: Date.now })` and passes it.

Existing tests: `app.test.ts` sign-ups go through `signInAndGetCookie`/`signedInUser`; the `/api/me` exact objects gain `role: UserRole.User, timeZone: TEST_TIME_ZONE`; the concurrent sign-up test creates two invites and expects two users. `server.test.ts` the same for `/api/me`. `seed-demo-users.test.ts` passes `invites` and expects `existing[0]` to be `admin@example.com` on a second run.

- [x] **Step 6: Run the whole server suite and typecheck**

Run: `pnpm --filter @superdoc-collab/server test:unit && pnpm --filter @superdoc-collab/server typecheck`
Expected: PASS, including the five restart tests (`collaboration-history.test.ts`, `projection-scheduler.test.ts` ×2, `topics-service.test.ts`, `history-routes.test.ts`) which reopen a claimed database.

- [x] **Step 7: Commit green** — `feat(server): first sign-up claims the instance, later ones need a pending invite`.

---

### Task 5: Setup, invite and admin routes; close the plugin's admin endpoints (G2)

**Files:**
- Create: `apps/server/src/admin/setup-routes.ts`, `invite-routes.ts`, `admin-routes.ts`, `users.ts` (`AdminUsersRepository`), `apps/server/src/http/require-admin.ts`
- Modify: `apps/server/src/http/app.ts`, `apps/server/src/server.ts` (`services.adminUsers`)
- Test: `apps/server/src/admin/setup-routes.test.ts`, `invite-routes.test.ts`, `admin-routes.test.ts`, `apps/server/src/http/auth-admin-endpoints.test.ts`

**Interfaces (produces):** the spec's route table; `requireAdmin()` (after `requireUser`) → 403 `{ error: ADMINS_ONLY_MESSAGE }`; `AdminUsersRepository { list(): AdminUser[]; countAdmins(): number; setRole({ id, role }): SetRoleOutcome }`, `enum SetRoleOutcome { Updated, NotFound, LastAdmin }`; `${ApiPath.Auth}/admin/*` answers 404 `{ error: NOT_FOUND_MESSAGE }` for every method before `auth.handler`.

- [x] **Step 1: Write the failing tests**

`setup-routes.test.ts`:

```ts
test('setup reports unclaimed, then claimed after the first sign-up', async () => {
  const server = await startTestServer({ claim: false });
  expect(await (await fetch(`${server.baseUrl}${ApiPath.Setup}`)).json()).toEqual({ claimed: false });
  await signInAndGetCookie({ server, credentials: { name: 'First', email: 'first@example.com', password: TEST_USER_PASSWORD } });
  expect(await (await fetch(`${server.baseUrl}${ApiPath.Setup}`)).json()).toEqual({ claimed: true });
  await server.stop();
});
```

`invite-routes.test.ts`:

```ts
test('a pending token answers pending; accepted, revoked, expired and unknown tokens answer 404 alike', async () => {
  const clock = { now: Date.now() };
  const server = await startTestServer({ now: () => clock.now });
  const lookup = (token: string) => fetch(`${server.baseUrl}${inviteApiPath(token)}`);
  const pending = server.services.invites.create({ createdBy: server.admin.id });
  expect(await (await lookup(tokenOf(pending.url))).json()).toEqual({ state: InviteState.Pending });
  const accepted = server.services.invites.create({ createdBy: server.admin.id });
  server.services.invites.accept({ id: accepted.id, userId: server.admin.id });
  expect((await lookup(tokenOf(accepted.url))).status).toBe(HttpStatus.NotFound);
  const revoked = server.services.invites.create({ createdBy: server.admin.id });
  server.services.invites.revoke(revoked.id);
  expect((await lookup(tokenOf(revoked.url))).status).toBe(HttpStatus.NotFound);
  const expired = server.services.invites.create({ createdBy: server.admin.id });
  clock.now += INVITE_TTL_MS + DAY_MS;
  expect((await lookup(tokenOf(expired.url))).status).toBe(HttpStatus.NotFound);
  expect((await lookup('nope')).status).toBe(HttpStatus.NotFound);
  await server.stop();
});
```

`admin-routes.test.ts` (helper `call({ server, method, path, cookie?, body? })` sends `origin: server.baseUrl` and JSON):

```ts
const ADMIN_CALLS = [
  { method: HttpMethod.Get, path: adminApiPath(AdminResource.Users) },
  { method: HttpMethod.Get, path: adminApiPath(AdminResource.Invites) },
  { method: HttpMethod.Post, path: adminApiPath(AdminResource.Invites) },
  { method: HttpMethod.Delete, path: `${adminApiPath(AdminResource.Invites)}/x` },
  { method: HttpMethod.Post, path: `${adminApiPath(AdminResource.Users)}/x/role` },
];

test.each(ADMIN_CALLS)('$method $path is 401 signed out and 403 for a user', async ({ method, path }) => {
  const server = await startTestServer();
  const user = await signedInUser({ server, name: 'Eve' });
  expect((await call({ server, method, path })).status).toBe(HttpStatus.Unauthorized);
  expect((await call({ server, method, path, cookie: user.cookie })).status).toBe(HttpStatus.Forbidden);
  await server.stop();
});

test('an admin lists users with roles and creation times', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  const users = (await (await call({ server, method: HttpMethod.Get, path: adminApiPath(AdminResource.Users), cookie: server.admin.cookie })).json()) as AdminUser[];
  expect(users.map((user) => [user.email, user.role])).toEqual([[server.admin.email, UserRole.Admin], [eve.email, UserRole.User]]);
  expect(typeof users[0]!.createdAt).toBe('number');
  await server.stop();
});

test('an admin creates an invite, sees it pending, and its URL admits exactly one sign-up', async () => {
  const server = await startTestServer();
  const created = await call({ server, method: HttpMethod.Post, path: adminApiPath(AdminResource.Invites), cookie: server.admin.cookie });
  expect(created.status).toBe(HttpStatus.Created);
  const invite = (await created.json()) as CreatedInvite;
  expect(invite.url.startsWith(`${server.baseUrl}/sign-up?invite=`)).toBe(true);
  const list = (await (await call({ server, method: HttpMethod.Get, path: adminApiPath(AdminResource.Invites), cookie: server.admin.cookie })).json()) as InviteSummary[];
  expect(list[0]).toMatchObject({ id: invite.id, state: InviteState.Pending, createdBy: { name: 'Admin' }, acceptedBy: null });
  const token = new URL(invite.url).searchParams.get('invite') as string;
  const first = await signUpWithToken({ server, email: 'one@example.com', token });
  const second = await signUpWithToken({ server, email: 'two@example.com', token });
  expect([first.status, second.status]).toEqual([HttpStatus.Ok, HttpStatus.Forbidden]);
  await server.stop();
});

test('revoking a pending invite answers 204; an accepted one 409; unknown 404', async () => {
  const server = await startTestServer();
  const pending = server.services.invites.create({ createdBy: server.admin.id });
  const accepted = server.services.invites.create({ createdBy: server.admin.id });
  server.services.invites.accept({ id: accepted.id, userId: server.admin.id });
  const revoke = (id: string) => call({ server, method: HttpMethod.Delete, path: `${adminApiPath(AdminResource.Invites)}/${id}`, cookie: server.admin.cookie });
  expect((await revoke(pending.id)).status).toBe(HttpStatus.NoContent);
  expect((await revoke(accepted.id)).status).toBe(HttpStatus.Conflict);
  expect((await revoke('nope')).status).toBe(HttpStatus.NotFound);
  await server.stop();
});

test('roles: promote, step down with another admin present, never demote the last admin, 404 and 400', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  const setRole = ({ id, role, cookie }: { id: string; role: string; cookie: string }) =>
    call({ server, method: HttpMethod.Post, path: `${adminApiPath(AdminResource.Users)}/${id}/role`, cookie, body: { role } });
  expect((await setRole({ id: eve.id, role: UserRole.Admin, cookie: server.admin.cookie })).status).toBe(HttpStatus.Ok);
  expect((await setRole({ id: server.admin.id, role: UserRole.User, cookie: server.admin.cookie })).status).toBe(HttpStatus.Ok);
  const last = await setRole({ id: eve.id, role: UserRole.User, cookie: eve.cookie });
  expect(last.status).toBe(HttpStatus.Conflict);
  expect(await last.json()).toEqual({ error: LAST_ADMIN_MESSAGE });
  expect((await setRole({ id: 'nope', role: UserRole.User, cookie: eve.cookie })).status).toBe(HttpStatus.NotFound);
  expect((await setRole({ id: eve.id, role: 'king', cookie: eve.cookie })).status).toBe(HttpStatus.BadRequest);
  await server.stop();
});

test('two admins demoting each other at once leave one admin', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  await call({ server, method: HttpMethod.Post, path: `${adminApiPath(AdminResource.Users)}/${eve.id}/role`, cookie: server.admin.cookie, body: { role: UserRole.Admin } });
  await Promise.all([
    call({ server, method: HttpMethod.Post, path: `${adminApiPath(AdminResource.Users)}/${eve.id}/role`, cookie: server.admin.cookie, body: { role: UserRole.User } }),
    call({ server, method: HttpMethod.Post, path: `${adminApiPath(AdminResource.Users)}/${server.admin.id}/role`, cookie: eve.cookie, body: { role: UserRole.User } }),
  ]);
  const admins = server.database.sqlite.prepare("select count(*) as n from user where role = 'admin'").get() as { n: number };
  expect(admins.n).toBe(1);
  await server.stop();
});
```

`apps/server/src/http/auth-admin-endpoints.test.ts`:

```ts
const PLUGIN_ADMIN_PATHS = ['impersonate-user', 'set-role', 'create-user', 'set-user-password', 'remove-user', 'ban-user', 'list-users'];

test.each(PLUGIN_ADMIN_PATHS)('/api/auth/admin/%s is 404 even for the admin', async (path) => {
  const server = await startTestServer();
  const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/admin/${path}`, {
    method: 'POST',
    headers: { cookie: server.admin.cookie, 'content-type': 'application/json', origin: server.baseUrl },
    body: JSON.stringify({ userId: server.admin.id, role: UserRole.User, email: 'x@example.com', password: TEST_USER_PASSWORD, name: 'X' }),
  });
  expect(response.status).toBe(HttpStatus.NotFound);
  await server.stop();
});

test('update-user cannot change the role', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/update-user`, {
    method: 'POST',
    headers: { cookie: eve.cookie, 'content-type': 'application/json', origin: server.baseUrl },
    body: JSON.stringify({ role: UserRole.Admin }),
  });
  expect(response.status).toBe(HttpStatus.BadRequest);
  const row = server.database.sqlite.prepare('select role from user where id = ?').get(eve.id) as { role: string };
  expect(row.role).toBe(UserRole.User);
  await server.stop();
});
```

- [x] **Step 2: Run to verify they fail** — 404 where 200/401/403 are expected; the plugin admin paths answer 200/401 instead of 404.
- [x] **Step 3: Commit red** — `test(server): pin setup, invite lookup, admin routes and the closed plugin endpoints`.
- [x] **Step 4: Implement**

`require-admin.ts`:

```ts
import { ADMINS_ONLY_MESSAGE, HttpStatus, UserRole } from '@superdoc-collab/types';
import { createMiddleware } from 'hono/factory';
import type { SignedIn } from './require-user';

export function requireAdmin() {
  return createMiddleware<SignedIn>(async (context, next) => {
    if (context.var.user.role !== UserRole.Admin) return context.json({ error: ADMINS_ONLY_MESSAGE }, HttpStatus.Forbidden);
    await next();
  });
}
```

`admin/users.ts`:

```ts
import { UserRole, type AdminUser } from '@superdoc-collab/types';
import { asc, eq } from 'drizzle-orm';
import type { AuthDatabase } from '../database/connection';
import { user } from '../database/schema/auth';

export enum SetRoleOutcome {
  Updated = 'updated',
  NotFound = 'not-found',
  LastAdmin = 'last-admin',
}

export class AdminUsersRepository {
  private readonly database: AuthDatabase;

  constructor(database: AuthDatabase) {
    this.database = database;
  }

  list(): AdminUser[] {
    return this.database.drizzle
      .select({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt })
      .from(user)
      .orderBy(asc(user.createdAt), asc(user.id))
      .all()
      .map((row) => ({ ...row, role: row.role as UserRole, createdAt: row.createdAt.getTime() }));
  }

  countAdmins(): number {
    return this.database.drizzle.select({ id: user.id }).from(user).where(eq(user.role, UserRole.Admin)).all().length;
  }

  setRole({ id, role }: { id: string; role: UserRole }): SetRoleOutcome {
    return this.database.drizzle.transaction((transaction) => {
      const row = transaction.select({ role: user.role }).from(user).where(eq(user.id, id)).get();
      if (!row) return SetRoleOutcome.NotFound;
      const demotesAnAdmin = row.role === UserRole.Admin && role === UserRole.User;
      if (demotesAnAdmin && this.countAdmins() === 1) return SetRoleOutcome.LastAdmin;
      transaction.update(user).set({ role }).where(eq(user.id, id)).run();
      return SetRoleOutcome.Updated;
    });
  }
}
```

(better-sqlite3 transactions are synchronous, so two demotions cannot interleave between the count and the update.)

`setup-routes.ts`: `routes.get(ApiPath.Setup, (context) => context.json({ claimed: invites.hasAnyUser() }))`.
`invite-routes.ts`: `routes.get(`${ApiPath.Invites}/:token`, …)`: `resolvePending` → `{ state: InviteState.Pending }`, otherwise 404 `{ error: INVITE_NOT_FOUND_MESSAGE }`.
`admin-routes.ts` (mounted at `ApiPath.Admin`): `GET /users`; `POST /users/:id/role` with `z.object({ role: z.nativeEnum(UserRole) })` → 200 `{ id, role }` / 400 / 404 / 409 `{ error: LAST_ADMIN_MESSAGE }`; `GET /invites`; `POST /invites` → 201 `CreatedInvite`; `DELETE /invites/:id` → 204 / 409 `{ error: INVITE_ALREADY_ACCEPTED_MESSAGE }` / 404 `{ error: INVITE_NOT_FOUND_MESSAGE }`.

`app.ts`:

```ts
const AUTH_ADMIN_PATH = `${ApiPath.Auth}/admin/*`;
...
  app.all(AUTH_ADMIN_PATH, (context) => context.json({ error: NOT_FOUND_MESSAGE }, HttpStatus.NotFound));
  app.all(`${ApiPath.Auth}/*`, (context) => auth.handler(...));   // existing line, must come after
  app.use(`${ApiPath.Admin}/*`, sameOriginOnly);
  app.use(`${ApiPath.Admin}/*`, signedIn);
  app.use(`${ApiPath.Admin}/*`, requireAdmin());
  app.route('/', createSetupRoutes({ services }));
  app.route('/', createInviteRoutes({ services }));
  app.route(ApiPath.Admin, createAdminRoutes({ services }));
```

(`NOT_FOUND_MESSAGE` from `libs/types` if it exists, else add `'Not found.'` next to the other messages.) The web never installs `adminClient`.

- [x] **Step 5: Run the tests and typecheck** — `pnpm --filter @superdoc-collab/server exec vitest run src/admin src/http && pnpm --filter @superdoc-collab/server typecheck`: PASS.
- [x] **Step 6: Commit green** — `feat(server): setup status, invite lookup, admin routes; the plugin's admin endpoints are closed`.

---

### Task 6: Recovery script `admin:promote` (G2)

**Files:**
- Create: `apps/server/src/admin/promote.ts`
- Modify: `apps/server/tsup.config.ts` (entry `'admin-promote': 'src/admin/promote.ts'`), `apps/server/package.json` (`"admin:promote": "node dist/admin-promote.js"`)
- Test: `apps/server/src/admin/promote.test.ts`, `apps/server/src/repository-shape/entrypoint.test.ts` (or the nearest build-shape test: the tsup entries include `admin-promote`)

- [x] **Step 1: Write the failing tests**

```ts
test('promote sets the role of an existing email and reports unknown emails', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  expect(promoteByEmail({ database: server.database, email: eve.email })).toBe(PromoteOutcome.Promoted);
  expect(server.database.sqlite.prepare('select role from user where id = ?').get(eve.id)).toEqual({ role: UserRole.Admin });
  expect(promoteByEmail({ database: server.database, email: 'nobody@example.com' })).toBe(PromoteOutcome.NotFound);
  await server.stop();
});

test('the build emits the promote entry', () => {
  expect(serverBuildOptions.entry).toMatchObject({ 'admin-promote': 'src/admin/promote.ts' });
});
```

- [x] **Step 2: Run to verify they fail** — `Cannot find module './promote'`; the entry is missing.
- [x] **Step 3: Commit red** — `test(server): pin admin:promote`.
- [x] **Step 4: Implement**

```ts
import { pathToFileURL } from 'node:url';
import { UserRole } from '@superdoc-collab/types';
import { eq } from 'drizzle-orm';
import { loadEnvironment } from '../config/environment';
import { AUTH_DATABASE_FILE, openDatabase, type AuthDatabase } from '../database/connection';
import { runMigrations } from '../database/migrate';
import { user } from '../database/schema/auth';

const FAILURE_EXIT_CODE = 1;
const EMAIL_ARGUMENT_INDEX = 2;

export enum PromoteOutcome {
  Promoted = 'promoted',
  NotFound = 'not-found',
}

export function promoteByEmail({ database, email }: { database: AuthDatabase; email: string }): PromoteOutcome {
  const result = database.drizzle.update(user).set({ role: UserRole.Admin }).where(eq(user.email, email)).run();
  if (result.changes === 1) return PromoteOutcome.Promoted;
  return PromoteOutcome.NotFound;
}

function main(): void {
  const email = process.argv[EMAIL_ARGUMENT_INDEX];
  if (!email) {
    console.error('Usage: node dist/admin-promote.js <email>');
    process.exit(FAILURE_EXIT_CODE);
  }
  const environment = loadEnvironment(process.env);
  const database = openDatabase({ directory: environment.databaseDirectory, fileName: AUTH_DATABASE_FILE });
  try {
    runMigrations(database);
    const outcome = promoteByEmail({ database, email });
    console.log(`${email}: ${outcome}`);
    if (outcome === PromoteOutcome.NotFound) process.exit(FAILURE_EXIT_CODE);
  } finally {
    database.sqlite.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] as string).href) main();
```

- [x] **Step 5: Run the tests** — PASS.
- [x] **Step 6: Commit green** — `feat(server): admin:promote recovers an instance without an admin`.

---

### Task 7: Web auth pages: setup state, invite state, time zone capture and backfill, 403 message (G3)

**Files:**
- Create: `apps/web/src/features/auth/setup-api.ts`, `use-setup.ts`, `use-invite.ts`, `apps/web/src/lib/browser-time-zone.ts`
- Modify: `sign-in-page.tsx`, `sign-up-page.tsx`, `auth-copy.ts`, `auth-failure.ts`, `use-auth-submit.ts`, `use-session.ts` (type only), every web test fixture that builds a `SessionUser` (`grep -rn "email:" apps/web/src --include=*.test.tsx` → add `role: UserRole.User, timeZone: 'UTC'`)
- Test: `sign-up-page.test.tsx` (new), `sign-in-page.test.tsx`, `use-auth-submit.test.tsx`

**Interfaces (produces):**
- `browserTimeZone(): string` → `Intl.DateTimeFormat().resolvedOptions().timeZone`
- `useSetup(): UseQueryResult<SetupStatus>` (`SETUP_QUERY_KEY = ['setup']`); `useInvite(token: string | null): UseQueryResult<InviteStatus>` (enabled with a token, `retry: false`; 404 rejects with `InviteNotValidError`)
- `authFailureMessage({ status, retryAfterSeconds, serverMessage })`: 403 → `serverMessage`
- `useAuthSubmit({ form, request, headers?, afterSuccess? })`: `headers` merged into the Better Auth `fetchOptions`; `error.message` forwarded as `serverMessage`; `afterSuccess()` awaited before navigation
- the sign-up form sends `{ ...values, timeZone: browserTimeZone() }`; the sign-in page's `afterSuccess` fetches the session and, when `user.timeZone === null`, calls `authClient.updateUser({ timeZone: browserTimeZone() })` once, then invalidates `SESSION_QUERY_KEY`
- copy: `CLAIM_TITLE = 'Claim this instance'`, `CLAIM_DESCRIPTION = 'The first account becomes the administrator.'`, `INVITED_TITLE = 'You were invited'`, `INVITED_DESCRIPTION = 'Create your account to join.'`, `INVITE_INVALID_MESSAGE = 'This invite is not valid. Ask an admin for a new link.'`, `CLAIM_LINK_LABEL = 'Claim this instance'`

- [x] **Step 1: Write the failing tests**

`sign-up-page.test.tsx` (mock `fetch` as `documents-page.test.tsx` does; mock `./auth-client` as `sign-in-page.test.tsx` does, exposing `signUpEmail`):

```tsx
function mockApi({ claimed, inviteStatus }: { claimed: boolean; inviteStatus: number }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return new Response(JSON.stringify({ user: null }));
    if (input === ApiPath.Setup) return new Response(JSON.stringify({ claimed }));
    if (String(input).startsWith(ApiPath.Invites)) return new Response(JSON.stringify({ state: InviteState.Pending }), { status: inviteStatus });
    throw new Error(`unexpected ${String(input)}`);
  });
}

async function fillAndSubmit() {
  await userEvent.type(await screen.findByLabelText('Name'), 'Eve');
  await userEvent.type(screen.getByLabelText('Email'), 'eve@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'long-enough-password');
  await userEvent.click(screen.getByRole('button', { name: SIGN_UP_LABEL }));
}

test('an unclaimed instance offers to claim it', async () => {
  mockApi({ claimed: false, inviteStatus: HttpStatus.NotFound });
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  expect(await screen.findByRole('heading', { name: CLAIM_TITLE })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SIGN_UP_LABEL })).toBeInTheDocument();
});

test('the claim form sends the browser time zone', async () => {
  mockApi({ claimed: false, inviteStatus: HttpStatus.NotFound });
  signUpEmail.mockResolvedValue({ data: { user: {} }, error: null });
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  await fillAndSubmit();
  expect(signUpEmail).toHaveBeenCalledWith(expect.objectContaining({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), expect.anything());
});

test('a claimed instance without a token shows only the invalid message', async () => {
  mockApi({ claimed: true, inviteStatus: HttpStatus.NotFound });
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  expect(await screen.findByText(INVITE_INVALID_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: SIGN_UP_LABEL })).not.toBeInTheDocument();
});

test('a pending invite shows the invited form', async () => {
  mockApi({ claimed: true, inviteStatus: HttpStatus.Ok });
  renderWithProviders(<SignUpPage />, { route: signUpPagePath('tok') });
  expect(await screen.findByRole('heading', { name: INVITED_TITLE })).toBeInTheDocument();
});

test('a revoked invite shows the invalid message', async () => {
  mockApi({ claimed: true, inviteStatus: HttpStatus.NotFound });
  renderWithProviders(<SignUpPage />, { route: signUpPagePath('tok') });
  expect(await screen.findByText(INVITE_INVALID_MESSAGE)).toBeInTheDocument();
});

test('submitting sends the token in the header and the zone in the body; a forbidden sign-up shows the server message', async () => {
  mockApi({ claimed: true, inviteStatus: HttpStatus.Ok });
  signUpEmail.mockResolvedValue({ data: null, error: { status: HttpStatus.Forbidden, message: SIGN_UP_BY_INVITATION_MESSAGE } });
  renderWithProviders(<SignUpPage />, { route: signUpPagePath('tok') });
  await fillAndSubmit();
  expect(await screen.findByText(SIGN_UP_BY_INVITATION_MESSAGE)).toBeInTheDocument();
  expect(signUpEmail).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'eve@example.com', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    expect.objectContaining({ headers: { [INVITE_TOKEN_HEADER]: 'tok' } }),
  );
});
```

`sign-in-page.test.tsx`, add: "shows the claim link while unclaimed and no sign-up link once claimed" and "a sign-in whose session has no time zone writes the browser zone once" (the `/api/me` mock answers `timeZone: null` first; assert `updateUser` called once with `{ timeZone: <browser zone> }`; a second test with a zone present asserts it is not called).

- [x] **Step 2: Run to verify they fail** — `CLAIM_TITLE` undefined, headings missing.
- [x] **Step 3: Commit red** — `test(web): pin the claim and invited sign-up states, the zone capture and the forbidden message`.
- [x] **Step 4: Implement**

`browser-time-zone.ts`: `export function browserTimeZone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }`.

`setup-api.ts`: `fetchSetup()` and `fetchInvite(token)` with `apiGet`; `InviteNotValidError extends ApiRequestError` on 404, `ApiRequestError` on any other non-ok.

`sign-up-page.tsx`:

```tsx
export function SignUpPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get(INVITE_QUERY_PARAMETER);
  const setup = useSetup();
  const invite = useInvite(token);
  if (!setup.data) return <SessionSkeleton />;
  if (!setup.data.claimed) return <SignUpCard title={CLAIM_TITLE} description={CLAIM_DESCRIPTION} token={null} />;
  if (token === null) return <InviteInvalidCard />;
  if (invite.isPending) return <SessionSkeleton />;
  if (invite.isError) return <InviteInvalidCard />;
  return <SignUpCard title={INVITED_TITLE} description={INVITED_DESCRIPTION} token={token} />;
}
```

`SignUpCard` keeps the existing form and calls `useAuthSubmit({ form, request: (values, options) => authClient.signUp.email({ ...values, timeZone: browserTimeZone() }, options), headers: headersFor(token) })`; `headersFor(null)` is `{}`, `headersFor(token)` is `{ [INVITE_TOKEN_HEADER]: token }`. The `signUpSchema` used by the form resolver is `signUpSchema.omit({ timeZone: true })` so the user never types it.

`use-auth-submit.ts`: `headers?: Record<string, string>`, `afterSuccess?: () => Promise<void>`; the capture object becomes `{ headers, onResponse }`; `AuthRequestResult.error` gains `message: string`; on error `authFailureMessage({ status, retryAfterSeconds, serverMessage: error.message })`; on success `await afterSuccess?.()` is not allowed (optional chaining on a call hides absence); write `if (afterSuccess) await afterSuccess();`.

`auth-failure.ts`: `if (status === HttpStatus.Forbidden) return serverMessage;`.

`sign-in-page.tsx`: `useSetup()`; the footer shows the claim link only when `setup.data?.claimed === false`, and nothing while loading or when claimed. `afterSuccess`: `const me = await fetchSession(); if (me.user && me.user.timeZone === null) await authClient.updateUser({ timeZone: browserTimeZone() });` (`fetchSession` is the existing `/api/me` fetcher behind `useSession`; export it from `use-session.ts` if it is local).

- [x] **Step 5: Run the tests and typecheck** — `pnpm --filter @superdoc-collab/web test:unit && pnpm typecheck`: PASS, workspace green.
- [x] **Step 6: Commit green** — `feat(web): claim and invited sign-up, browser time zone on sign-up and first sign-in, setup-aware sign-in`.

---

### Task 8: Admin page, invite dialog, role guard, header link (G3)

**Files:**
- Create: `apps/web/src/features/admin/admin-api.ts`, `use-admin-users.ts`, `use-invites.ts`, `admin-page.tsx`, `users-table.tsx`, `invites-table.tsx`, `invite-created-dialog.tsx`, `admin-copy.ts`, `require-admin.tsx`
- Modify: `apps/web/src/app/router.tsx`, `apps/web/src/features/documents/documents-page.tsx`, `apps/web/src/testing/render-with-providers.tsx` (mount `<Toaster />`)
- Test: `admin-page.test.tsx`, `require-admin.test.tsx`, `documents-page.test.tsx` (header link)

**Interfaces (produces):**
- copy: `ADMIN_LINK_LABEL = 'Admin'`, `ADMINS_ONLY_TOAST = 'Admins only'`, `GENERATE_INVITE_LABEL = 'Generate invite'`, `INVITE_CREATED_TITLE = 'Invite link'`, `INVITE_CREATED_DESCRIPTION = 'Send this link to one person. It works once and expires in seven days. It is shown only now.'`, `COPY_LINK_LABEL = 'Copy link'`, `INVITE_COPIED_TOAST = 'Invite link copied'`, `COPY_FAILED_MESSAGE = 'Copy failed. Select the link and copy it.'`, `REVOKE_LABEL = 'Revoke'`, `MAKE_ADMIN_LABEL = 'Make admin'`, `MAKE_USER_LABEL = 'Make user'`, `ACTION_FAILED_MESSAGE = 'That did not work. Try again.'`, `INVITE_STATE_LABELS: Record<InviteState, string> = { pending: 'Pending', accepted: 'Accepted', revoked: 'Revoked', expired: 'Expired' }`, `NO_INVITES_MESSAGE = 'No invites yet.'`
- query keys `ADMIN_USERS_QUERY_KEY = ['admin', 'users']`, `INVITES_QUERY_KEY = ['admin', 'invites']`

- [x] **Step 1: Write the failing tests**

`admin-page.test.tsx` (fetch mock: `/api/me` admin, users list, invites list, POST invites → 201 `{ id, url, expiresAt }`, DELETE → 204, POST role → 200; `vi.spyOn(navigator.clipboard, 'writeText')`):

- "lists users with their role and hides the role toggle on the signed-in admin"
- "generate invite shows the dialog with the URL in a read-only field, copies it, toasts, and refetches the list" (assert the `textbox` with the URL value has `readonly`, `writeText` called with it, `findByText(INVITE_COPIED_TOAST)`, a second GET of invites)
- "when the clipboard is unavailable the dialog still shows the URL and says to copy it by hand" (`writeText` rejects → `COPY_FAILED_MESSAGE` visible, URL still in the field)
- "revoke sends DELETE and refetches; a failed revoke shows the action-failed message"
- "make admin posts the role and refetches users"
- "states and times: a pending row reads Pending with a Revoke button; an accepted row reads Accepted without one; expiry renders through formatTimestamp" (compare against `formatTimestamp(expiresAt)`, never a literal)

`require-admin.test.tsx`: "a user is sent to documents with the Admins-only toast", "signed out goes to sign-in with next", "an admin renders the children".

`documents-page.test.tsx`, add: "the header shows the Admin link only for admins".

- [x] **Step 2: Run to verify they fail** — modules missing.
- [x] **Step 3: Commit red** — `test(web): pin the admin page, the invite dialog and the role guard`.
- [x] **Step 4: Implement**

`admin-api.ts`: `fetchAdminUsers`, `fetchInvites`, `createInvite(): Promise<CreatedInvite>` (expects 201), `revokeInvite(id)` (expects 204), `setUserRole({ id, role })` (expects 200); each throws `ApiRequestError` otherwise, using `apiGet`/`apiSend`.

`invite-created-dialog.tsx`: shadcn `Dialog` opened with the `CreatedInvite`; an `Input` `readOnly` with `value={invite.url}` and `aria-label={INVITE_CREATED_TITLE}`; a `COPY_LINK_LABEL` button whose click awaits `navigator.clipboard.writeText(url)` inside `try`; on success `toast(INVITE_COPIED_TOAST)`, on failure sets a local `copyFailed` state that renders `COPY_FAILED_MESSAGE`. Generation itself never depends on the clipboard.

`invites-table.tsx` (the `<Table>` carries `aria-label={INVITES_TABLE_LABEL}` = `'Invites'`; `users-table.tsx` carries `USERS_TABLE_LABEL` = `'Users'`, so tests and E2E scope by table): `GENERATE_INVITE_LABEL` button → `useMutation({ mutationFn: createInvite, onSuccess: async (created) => { setCreated(created); await queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY }); } })`; `isError` renders `ACTION_FAILED_MESSAGE` next to the button. Columns State (`INVITE_STATE_LABELS[invite.state]`), Created, Expires (`formatTimestamp`), Created by, Accepted by, Action (`REVOKE_LABEL` for pending only; its mutation invalidates `INVITES_QUERY_KEY`, `isError` renders `ACTION_FAILED_MESSAGE` in the row). Empty state: `NO_INVITES_MESSAGE` in the same paragraph style as `document-table.tsx`.

`users-table.tsx`: Name, Email, Role, Joined (`formatTimestamp`), Action (`MAKE_ADMIN_LABEL`/`MAKE_USER_LABEL`, omitted for the signed-in user; mutation invalidates `ADMIN_USERS_QUERY_KEY`; `isError` renders `ACTION_FAILED_MESSAGE`).

`admin-page.tsx`: the documents header (name, `SignOutButton`), `Users` and `Invites` sections.

`require-admin.tsx`:

```tsx
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();
  const isUserNotAdmin = user !== null && user.role !== UserRole.Admin;
  useEffect(() => {
    if (isUserNotAdmin) toast(ADMINS_ONLY_TOAST);
  }, [isUserNotAdmin]);
  if (isLoading) return <SessionSkeleton />;
  if (!user) return <Navigate to={`${AppRoute.SignIn}?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (isUserNotAdmin) return <Navigate to={AppRoute.Documents} replace />;
  return children;
}
```

`router.tsx`: `{ path: AppRoute.Admin, element: <RequireAdmin><AdminPage /></RequireAdmin> }`. `documents-page.tsx` header: `{user?.role === UserRole.Admin && <Link to={AppRoute.Admin}>{ADMIN_LINK_LABEL}</Link>}` before `SignOutButton`. `render-with-providers.tsx`: render `<Toaster />` inside the providers.

- [x] **Step 5: Run the tests and typecheck** — PASS.
- [x] **Step 6: Commit green** — `feat(web): admin page with users, invites, the invite link dialog and the role guard`.

---

### Task 9: E2E: fixtures, auth spec, admin spec (G4)

**Files:**
- Modify: `e2e/fixtures.ts`, `e2e/auth.spec.ts`
- Create: `e2e/admin.spec.ts`

**Interfaces (produces):** fixtures `signedInAdmin({ browser, clientAddress })` (context with `permissions: ['clipboard-read', 'clipboard-write']`, random `x-forwarded-for`, registered in `openedContexts`, signed in as `admin@example.com` with `DEMO_PASSWORD`); `generateInvite({ page }): Promise<string>` (clicks Generate invite, reads the URL from the dialog's read-only textbox, closes the dialog); `acceptInvite({ browser, url, name, email })` (new context with its own random address, registered for closing, opens the URL, fills the form, submits, returns `{ context, page }`).

- [x] **Step 1: Write the failing specs**

`auth.spec.ts`: replace "a new user signs up and lands on documents" with:

```ts
test('sign-up without an invite is refused once the instance is claimed', async ({ page }) => {
  await page.goto(AppRoute.SignUp);
  await expect(page.getByText(INVITE_INVALID_MESSAGE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up' })).toHaveCount(0);
});
```

`admin.spec.ts` (`test.describe.configure({ mode: 'serial' })`; the page renders Users above Invites, so every invite locator scopes to `const invites = page.getByRole('table', { name: 'Invites' })`, and the newest invite is `invites.getByRole('row').nth(1)`, row 0 being the header):

```ts
test('an admin invites a user who joins; the admin link shows only on the admin side', async ({ browser, clientAddress }) => {
  const admin = await signedInAdmin({ browser, clientAddress });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  const newest = admin.page.getByRole('table', { name: 'Invites' }).getByRole('row').nth(1);
  await expect(newest.getByRole('cell', { name: 'Pending' })).toBeVisible();
  const email = `eve-${Date.now()}@example.com`;
  const invited = await acceptInvite({ browser, url, name: 'Eve', email });
  await expectSignedInAs({ page: invited.page, name: 'Eve' });
  await expect(invited.page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await admin.page.reload();
  await expect(admin.page.getByRole('table', { name: 'Invites' }).getByRole('row').nth(1).getByRole('cell', { name: 'Accepted' })).toBeVisible();
  await expect(admin.page.getByRole('table', { name: 'Users' }).getByRole('row', { name: new RegExp(email) })).toBeVisible();
});

test('an invite link cannot be used twice', async ({ browser, clientAddress }) => {
  const admin = await signedInAdmin({ browser, clientAddress });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  await acceptInvite({ browser, url, name: 'One', email: `one-${Date.now()}@example.com` });
  const again = await openedContext({ browser });
  await again.page.goto(url);
  await expect(again.page.getByText(INVITE_INVALID_MESSAGE)).toBeVisible();
});

test('a revoked invite shows the invalid message', async ({ browser, clientAddress }) => {
  const admin = await signedInAdmin({ browser, clientAddress });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  await admin.page.getByRole('table', { name: 'Invites' }).getByRole('row').nth(1).getByRole('button', { name: 'Revoke' }).click();
  await expect(admin.page.getByRole('table', { name: 'Invites' }).getByRole('row').nth(1).getByRole('cell', { name: 'Revoked' })).toBeVisible();
  const visitor = await openedContext({ browser });
  await visitor.page.goto(url);
  await expect(visitor.page.getByText(INVITE_INVALID_MESSAGE)).toBeVisible();
});

test('a user opening /admin is sent to documents with the admins-only toast', async ({ browser }) => {
  const user = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await user.page.goto(AppRoute.Admin);
  await expect(user.page).toHaveURL(/\/documents$/);
  await expect(user.page.getByText('Admins only')).toBeVisible();
});
```

(`openedContext({ browser })` is a fixture helper that creates a context with a random client address and registers it for closing; `signedInContext` already does this for a known user.)

- [x] **Step 2: Run the two specs** — against the pre-build bundle they fail (no `/admin`, open sign-up); against the branch they must pass in Step 4.
- [x] **Step 3: Commit red** — `test(e2e): pin invite-only sign-up and the admin page`.
- [x] **Step 4: Fixtures, then the whole suite** — `pnpm test:e2e`: PASS (seeded users still sign in; the stack is claimed by `admin@example.com` because the seed runs before `main`).
- [x] **Step 5: Commit green** — `test(e2e): fixtures for the admin and invited contexts`.

---

### Task 10: Delivery: compose files, env example, runbooks, README with the agent prompt (G4)

**Files:**
- Modify: `deploy/docker-compose.yml`, `docker-compose.yml`, `.env.example`, `docs/features/deploy/runbook-railway.md`, `docs/features/deploy/runbook.md`, `README.md`
- Modify (G2 files, by developer-4, stated in the commit): `apps/server/src/repository-shape/compose.test.ts`, `delivery-docs.test.ts`
- CI: `.github/workflows/verify.yml` is **unchanged**: the smoke container keeps `SEED_DEMO_USERS=true`, the seed claims the instance, Ana's sign-in keeps answering 200.

- [x] **Step 1: Write the failing repository-shape tests**

`compose.test.ts`: the production compose sets `SEED_DEMO_USERS` to `"false"` and never reads `DEMO_PASSWORD`; `REQUIRED_VARIABLES` drops `SEED_DEMO_USERS`. `delivery-docs.test.ts`: the README's `## Configuration` table lists every variable the production compose reads; the fenced block under `## Install with an agent` contains `AUTH_SECRET`, `APP_ORIGIN`, `SEED_DEMO_USERS=false` and the words `claim the instance`; the README's `## Limits` mentions `admin-promote`.

- [x] **Step 2: Run them** — FAIL on the README.
- [x] **Step 3: Commit red** — `test(repository-shape): pin the production compose and the newcomer README`.
- [x] **Step 4: Implement**

- `deploy/docker-compose.yml`: `SEED_DEMO_USERS: "false"`; drop `DEMO_PASSWORD`. Root `docker-compose.yml`: keep `SEED_DEMO_USERS: ${SEED_DEMO_USERS:?}` (tests and local demos). `.env.example`: `SEED_DEMO_USERS=false`; `DEMO_PASSWORD` kept under its existing note, reworded "tests only".
- `runbook-railway.md`: step 3 sets `SEED_DEMO_USERS=false` and drops `DEMO_PASSWORD`; new step **6. Claim the instance** (open the URL, "Claim this instance", create the admin; `/admin` → Generate invite → send links); **Hand it over** sends the URL plus invite links, never a shared password; the reset paragraph says "the volume is empty, open the URL and claim again" instead of "seeds the demo users again". `runbook.md` (Dokploy, historical): one line at the top, the seed is test-only since ADR 0020.
- `README.md`: rewrite in the spec's order; the three screenshots are the existing `docs/media/readme/` files (claim, timeline, two authors) plus one new `docs/media/readme/09-admin-invites.png` taken by the tester; **Limits** gains "An instance claimed without an admin (the role write failed) is recovered with `railway ssh -- node dist/admin-promote.js <email>` or `docker compose exec app node dist/admin-promote.js <email>`". The agent prompt block:

````markdown
## Install with an agent

Paste this into Claude Code, Codex or any agent with a shell. It installs the app and stops where only you can continue.

```text
Install https://github.com/dhyegocalota/superdoc-take-home for me.

1. Clone the repository and read README.md and docs/features/deploy/runbook-railway.md.
2. Ask me one question: Railway (hosted, about US$5/month) or Docker Compose on this machine. Do not continue until I answer.
3. Generate AUTH_SECRET with `openssl rand -base64 48`. Set the environment the runbook lists: PORT=3000, DATABASE_DIR=/data, WEB_DIST_DIR=/app/web, TRUST_PROXY=true (Railway) or false (local), APP_ORIGIN=<the public URL>, SEED_DEMO_USERS=false, and, if I give you an OpenRouter key, OPENROUTER_API_KEY and LLM_MODEL. Never print a secret.
4. Railway: follow the runbook steps 1 to 5 with the Railway CLI (I will run `railway login` when you ask). Docker: `docker compose up --build -d` with the variables above.
5. Verify: GET /api/health answers 200 and GET /api/setup answers {"claimed":false}.
6. Print the URL and stop. Tell me to open it and claim the instance: the first account created becomes the administrator, and sign-up closes behind it. Then tell me that /admin generates single-use invite links for my team.
```
````

- [x] **Step 5: Run the repository-shape tests, format and typecheck** — PASS.
- [x] **Step 6: Commit green** — `docs: newcomer README with an agent install prompt; production seeds nothing`.

---

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 migration | drizzle-kit rebuilds `user` instead of altering it | the SQL contains `__new_user` | hand-write `0004` as `ALTER TABLE … ADD` lines plus `CREATE TABLE invites`; `drizzle-kit generate --custom` for the snapshot |
| 2 plugin | `session.user.role` empty at runtime | `SessionUserWithoutRoleError` in `session.test.ts` | confirm the plugin is in `plugins`, the default applied, the migration ran |
| 4 plugin hooks | the gate never runs or runs on every path | sign-in tests fail, or the claim test gets 403 | check `matcher` compares `context.path === '/sign-up/email'` and the plugin is listed after `admin()` |
| 4 after hook | the user row is not yet visible to Drizzle in `after` | `claimAdmin` updates no row and every claim is deleted with 403 | move the role write and the invite consumption to `databaseHooks.user.create.after` |
| 4 test server | restart tests get 403 on the claim | `TestSignInFailedError({ step: 'claim' })` in the five restart suites | `claimOrSignInAdmin` must check `hasAnyUser()` first |
| 4 retry | `claim`/`now` lost on `EADDRINUSE` | a flaky `NoTestAdminError` under parallel suites | forward both options in the retry call |
| 5 CSRF | admin POSTs answer 403 from `csrf` | every admin mutation test fails with 403 and no `error` body | send `origin: server.baseUrl` from `call` |
| 5 ordering | `/api/auth/admin/*` still reaches the plugin | `auth-admin-endpoints.test.ts` sees 200/401 | the 404 route must be registered before the `/api/auth/*` catch-all |
| 6 build | `dist/admin-promote.js` missing in the image | `railway ssh -- node dist/admin-promote.js` says no such file | the tsup entry test pins it |
| 8 toast | `findByText(INVITE_COPIED_TOAST)` never resolves | Toaster not mounted in `renderWithProviders` | mount it there |
| 9 clipboard | headless Chromium denies `readText` | `generateInvite` times out | the dialog's read-only field is the source of truth: read its value, never the clipboard |
| 9 parallelism | rows from other tests match | strict-mode violations on `getByRole('cell', …)` | serial mode and `nth(1)` scoping, as written |
| 10 live deploy | the entrypoint seed fails on the claimed Railway database and the container never starts | `railway logs` shows the seed exiting 1 with the invitation message | set `SEED_DEMO_USERS=false` **before** `railway up` (Z) |

**Steps with no backout:** migration `0004` on the Railway volume: additive, nullable or defaulted columns and a new table; a rollback deploy keeps running on the migrated schema.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [x] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [x] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded (claim, invited sign-up, admin page with the invite dialog, invalid invite).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
- [ ] **Deploy, in this order:** `railway variables --set SEED_DEMO_USERS=false --skip-deploys` (the live service still has `true`; with it the seed would fail on the claimed database and the container would never start); merge; `railway up`; the migration applies on the volume; then promote the owner's account with `railway ssh -- node dist/admin-promote.js <email>`, or reset the volume and claim fresh (owner's call; the instance already holds Ana and Bruno from the first walk).
