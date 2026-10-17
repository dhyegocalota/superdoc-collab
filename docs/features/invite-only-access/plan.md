# Invite-only access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the first account claims a fresh instance as admin, every later account needs a single-use invite link generated on `/admin`, production seeds nothing, and the README tells a newcomer or an agent how to install and claim.

**Architecture:** Better Auth's `admin` plugin provides `user.role`; a gate inside the existing `hooks.before` on `/sign-up/email` allows a claim (no users yet) or a pending invite carried in the `x-invite-token` header, and the `hooks.after` stamps the admin role or consumes the invite. Invites are a new table in `auth.sqlite` with hashed tokens, served by an `InvitesRepository` and three route modules (`/api/setup`, `/api/invites/:token`, `/api/admin/*`). The web gains a setup query, an invite query, two sign-up states and an `/admin` page.

**Tech Stack:** Hono, Better Auth 1.7 (`admin` plugin, client plugin), Drizzle + better-sqlite3 + drizzle-kit migrations, zod, React 19, TanStack Query, react-router, shadcn/ui, sonner, Vitest, Playwright.

**Spec:** `docs/features/invite-only-access/spec.md` (ADR 0020)

**Seam:** `createAuth` hooks (`apps/server/src/auth/auth.ts`), `createApp` route mounting (`apps/server/src/http/app.ts`), `router.tsx` and the two auth pages in `apps/web/src/features/auth/`.

**Assumptions (decided, owner can override):**

- The invite token travels in the `x-invite-token` header, not in the sign-up body (spec, Invites).
- The role is written with Drizzle in the `after` hook and in the admin route, not through `auth.api.setRole`, so no admin session is needed inside hooks.
- The E2E suite runs against a seeded, claimed stack; the claim itself is pinned by a real-HTTP server test and by the Playwright MCP walk on the deployed instance, which is unclaimed when first opened.
- The test server claims itself with `admin@example.com` at start; `signedInUser` creates an invite through the repository, so the existing 380-odd server tests keep passing without edits.
- Migration `0004` is generated with `drizzle-kit generate` from the hand-edited schema (the Better Auth CLI is a version behind the runtime and is not used).

## Global Constraints

- No comments except `// NB ADR NNNN:` pointers; flat `if`s; early returns; no `else`; no `?? default`; enums over literals; constants at the top of the file or in `libs/types`; named parameters for more than one parameter; array methods over loops; no `.js` imports.
- Every change ships with tests; red test first in its own commit; Conventional Commits; never commit from `main`; branch `feat/invite-only-access`.
- Errors are `{ error: string }` with `HttpStatus`; creation answers `201`; deletion answers `204`.
- Times are epoch milliseconds end to end; the web renders them with `formatTimestamp` in the reader's zone.
- Copy in English; messages are exported constants, never inline strings in JSX or handlers.
- Prettier (`pnpm format:check`) green before every commit; `pnpm typecheck` green for the package being changed before every commit, and for the whole workspace again from Task 7 on (Task 1 adds `role` to `SessionUser`, which the server fixes in Task 2 and the web fixtures in Task 7; CI runs on the pull request).

## Review Focus

1. A sign-up whose `x-invite-token` was pending at page load but consumed by someone else before submit must answer 403 and leave no user row (Task 4, test "a token consumed between the check and the submit creates no user").
2. Two sign-ups racing on an empty instance must yield exactly one admin (Task 4, test "two concurrent first sign-ups leave one admin").
3. A non-admin calling any `/api/admin/*` route, signed out or signed in, must get 401 or 403 and change nothing (Task 5, matrix test).
4. An admin demoting the only admin, including themselves, must be refused with 409 (Task 5, test "the last admin cannot be demoted").
5. The sign-up page opened with a dead link must never render the form, and a 403 on submit must show the server's sentence, not the generic one (Task 7, tests "a revoked invite shows the invalid message" and "a forbidden sign-up shows the server message").

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 types | `libs/types/src/auth.ts`, `libs/types/src/invites.ts` (new), `libs/types/src/routes.ts`, `libs/types/src/constants.ts`, `libs/types/src/index.ts`, `libs/types/src/routes.test.ts`, `libs/types/src/invites.test.ts` (new) | developer-1 |
| G2 server | `apps/server/src/auth/*`, `apps/server/src/admin/*` (new), `apps/server/src/http/app.ts`, `apps/server/src/http/require-admin.ts` (new), `apps/server/src/database/schema/auth.ts`, `apps/server/src/database/schema/invites.ts` (new), `apps/server/drizzle/0004_*`, `apps/server/src/documents/share-links.ts`, `apps/server/src/testing/test-server.ts`, `apps/server/src/testing/collaboration-client.ts`, `apps/server/src/seed.ts`, `apps/server/src/admin/promote.ts` (new), `apps/server/package.json`, `apps/server/src/repository-shape/*.test.ts` | developer-2 |
| G3 web | `apps/web/src/features/auth/*`, `apps/web/src/features/admin/*` (new), `apps/web/src/app/router.tsx`, `apps/web/src/features/documents/documents-page.tsx`, `apps/web/src/testing/render-with-providers.tsx` | developer-3 |
| G4 e2e + delivery | `e2e/fixtures.ts`, `e2e/auth.spec.ts`, `e2e/admin.spec.ts` (new), `playwright.config.ts`, `.github/workflows/verify.yml`, `.env.example`, `deploy/docker-compose.yml`, `docker-compose.yml`, `docs/features/deploy/runbook-railway.md`, `docs/features/deploy/runbook.md`, `README.md` | developer-4 |

## Sequencing

G1 first (every other group imports from it). G2 and G3 in parallel after G1 (G3 mocks `fetch`, so it does not need the server). G4 after G2 and G3 are merged into the branch (E2E needs both). Within G2, Tasks 2 → 3 → 4 → 5 → 6 in order; within G3, Task 7 → Task 8.

---

### Task 1: Shared types, enums, routes and messages (G1)

**Files:**
- Modify: `libs/types/src/auth.ts`
- Create: `libs/types/src/invites.ts`
- Modify: `libs/types/src/routes.ts`
- Modify: `libs/types/src/constants.ts` (add `DAY_MS` if absent; `MINUTE_MS`, `HOUR_MS` exist)
- Modify: `libs/types/src/index.ts`
- Test: `libs/types/src/routes.test.ts`, `libs/types/src/invites.test.ts`

**Interfaces:**
- Produces:
  - `enum UserRole { Admin = 'admin', User = 'user' }`
  - `type SessionUser = { id: string; name: string; email: string; role: UserRole }`
  - `const SIGN_UP_BY_INVITATION_MESSAGE = 'Sign-up is by invitation. Ask an admin for a link.'`
  - `const INVITE_TOKEN_HEADER = 'x-invite-token'`
  - `enum InviteState { Pending = 'pending', Accepted = 'accepted', Revoked = 'revoked', Expired = 'expired' }`
  - `const INVITE_TTL_MS = 7 * DAY_MS`
  - `type InviteSummary = { id: string; state: InviteState; createdAt: number; expiresAt: number; createdBy: { name: string }; acceptedBy: { name: string } | null }`
  - `type CreatedInvite = { id: string; url: string; expiresAt: number }`
  - `type AdminUser = { id: string; name: string; email: string; role: UserRole; createdAt: number }`
  - `type SetupStatus = { claimed: boolean }`
  - `type InviteStatus = { state: InviteState }`
  - `function inviteStateOf({ now, expiresAt, acceptedAt, revokedAt }: { now: number; expiresAt: number; acceptedAt: number | null; revokedAt: number | null }): InviteState`
  - `AppRoute.Admin = '/admin'`; `ApiPath.Setup = '/api/setup'`, `ApiPath.Invites = '/api/invites'`, `ApiPath.Admin = '/api/admin'`; `enum AdminResource { Users = 'users', Invites = 'invites' }`
  - `function inviteApiPath(token: string): string` → `/api/invites/<encoded token>`
  - `function adminApiPath(resource: AdminResource): string` → `/api/admin/users` | `/api/admin/invites`
  - `function signUpPagePath(token: string): string` → `/sign-up?invite=<encoded token>`
  - `const INVITE_QUERY_PARAMETER = 'invite'`

- [ ] **Step 1: Write the failing tests**

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

Append to `libs/types/src/routes.test.ts`:

```ts
test('invite and admin paths encode their parameters', () => {
  expect(inviteApiPath('a b')).toBe('/api/invites/a%20b');
  expect(adminApiPath(AdminResource.Users)).toBe('/api/admin/users');
  expect(adminApiPath(AdminResource.Invites)).toBe('/api/admin/invites');
  expect(signUpPagePath('x/y')).toBe('/sign-up?invite=x%2Fy');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @superdoc-history/types exec vitest run src/invites.test.ts src/routes.test.ts`
Expected: FAIL, `Cannot find module './invites'` for the first file and `inviteApiPath is not defined` for the second.

- [ ] **Step 3: Implement**

`libs/types/src/invites.ts`:

```ts
import { DAY_MS } from './constants';

export const INVITE_TTL_MS = 7 * DAY_MS;
export const INVITE_TOKEN_HEADER = 'x-invite-token';
export const INVITE_QUERY_PARAMETER = 'invite';

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

`libs/types/src/auth.ts`, add:

```ts
export const SIGN_UP_BY_INVITATION_MESSAGE = 'Sign-up is by invitation. Ask an admin for a link.';

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}

export type SessionUser = { id: string; name: string; email: string; role: UserRole };
export type AdminUser = { id: string; name: string; email: string; role: UserRole; createdAt: number };
```

(replace the existing `SessionUser` line.)

`libs/types/src/routes.ts`, add `Admin = '/admin'` to `AppRoute`; `Setup = '/api/setup'`, `Invites = '/api/invites'`, `Admin = '/api/admin'` to `ApiPath`; and:

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

(`INVITE_QUERY_PARAMETER` imported from `./invites`.) `libs/types/src/constants.ts`: add `export const DAY_MS = 24 * HOUR_MS;` if it is not there. `libs/types/src/index.ts`: `export * from './invites';`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm --filter @superdoc-history/types exec vitest run && pnpm typecheck`
Expected: types green. `pnpm typecheck` reports every place that builds a `SessionUser` without `role` (`apps/server/src/auth/session.ts`, web test fixtures); list them in the commit body. Tasks 2 and 7 fix them.

- [ ] **Step 5: Commit**

```bash
git add libs/types/src/auth.ts libs/types/src/invites.ts libs/types/src/routes.ts libs/types/src/constants.ts libs/types/src/index.ts libs/types/src/invites.test.ts libs/types/src/routes.test.ts
git commit -m "feat(types): user roles, invite states and the admin and invite paths"
```

---

### Task 2: Schema, migration, admin plugin, role in the session, shared token hash (G2)

**Files:**
- Modify: `apps/server/src/database/schema/auth.ts`
- Create: `apps/server/src/database/schema/invites.ts`
- Create: `apps/server/drizzle/0004_<name>.sql` + `meta/0004_snapshot.json` + journal entry (generated)
- Modify: `apps/server/src/auth/auth.ts` (plugin only; the gate is Task 4)
- Modify: `apps/server/src/auth/session.ts`
- Modify: `apps/server/better-auth.config.ts` (plugin, kept in sync even though the CLI is not used)
- Create: `apps/server/src/auth/token-hash.ts`
- Modify: `apps/server/src/documents/share-links.ts` (import the shared hash)
- Test: `apps/server/src/auth/session.test.ts`, `apps/server/src/auth/token-hash.test.ts`, `apps/server/src/documents/share-links.test.ts` (the hash test moves)

**Interfaces:**
- Consumes: `UserRole` from Task 1.
- Produces:
  - `authSchema.user` with `role: text('role', { enum: [UserRole.Admin, UserRole.User] }).notNull().default(UserRole.User)`, `banned: integer('banned', { mode: 'boolean' }).notNull().default(false)`, `banReason: text('ban_reason')`, `banExpires: integer('ban_expires', { mode: 'timestamp_ms' })`; `authSchema.session.impersonatedBy: text('impersonated_by')`.
  - `invites` table: `id text pk`, `tokenHash text notNull unique`, `createdBy text notNull references user.id`, `createdAt integer timestamp_ms notNull`, `expiresAt integer timestamp_ms notNull`, `acceptedBy text references user.id`, `acceptedAt integer timestamp_ms`, `revokedAt integer timestamp_ms`.
  - `hashToken(token: string): string` (sha256 hex) in `auth/token-hash.ts`; `hashShareToken` becomes a re-export alias removed: `share-links.ts` calls `hashToken`.
  - `readSession` returns `role`.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/auth/token-hash.test.ts` (moved from `share-links.test.ts::the stored hash is 64 hex characters and differs from the token`):

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

Append to `apps/server/src/auth/session.test.ts` (it already starts a test server and signs in; follow its existing helper):

```ts
test('the session user carries the role, user by default', async () => {
  const { server, owner } = await signedInOwner();
  const user = await readSession({ auth: server.auth, headers: new Headers({ cookie: owner.cookie }) });
  expect(user?.role).toBe(UserRole.User);
  await server.stop();
});
```

(after Task 4 the owner is a user admitted by invite, so `User` stays right.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @superdoc-history/server exec vitest run src/auth/token-hash.test.ts src/auth/session.test.ts`
Expected: FAIL, `Cannot find module './token-hash'` and `expected undefined to be 'user'`.

- [ ] **Step 3: Schema and migration**

`apps/server/src/database/schema/auth.ts`: add the four `user` columns and `impersonatedBy` on `session` exactly as in Interfaces, importing `UserRole` from `@superdoc-history/types`.

`apps/server/src/database/schema/invites.ts`:

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

Generate the migration from the repository root:

```bash
cd apps/server && pnpm exec drizzle-kit generate --name invite-only-access && cd ../..
```

Open `apps/server/drizzle/0004_invite-only-access.sql` and check it contains `ALTER TABLE \`user\` ADD \`role\`` with `DEFAULT 'user' NOT NULL`, the three ban columns, `ALTER TABLE \`session\` ADD \`impersonated_by\``, and `CREATE TABLE \`invites\``. `apps/server/src/database/migrate.ts` already runs every file at boot; the existing `migrate.test.ts` (if present) or `server.test.ts` boots a fresh database and proves it applies.

- [ ] **Step 4: Plugin, session, shared hash**

`apps/server/src/auth/auth.ts`, inside `betterAuth({...})`:

```ts
import { admin } from 'better-auth/plugins';
...
    plugins: [admin({ defaultRole: UserRole.User, adminRoles: [UserRole.Admin] })],
```

`apps/server/better-auth.config.ts`: the same `plugins` line.

`apps/server/src/auth/session.ts`:

```ts
export async function readSession({ auth, headers }: { auth: Auth; headers: Headers }): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role as UserRole };
}
```

(The plugin types `role` as `string | null | undefined`; the column is `NOT NULL` with the enum, so the cast is the boundary. If `role` arrives empty, throw `new Error('Session user has no role.')` instead of defaulting.)

`apps/server/src/auth/token-hash.ts`:

```ts
import { createHash } from 'node:crypto';

const TOKEN_DIGEST = 'sha256';

export function hashToken(token: string): string {
  return createHash(TOKEN_DIGEST).update(token).digest('hex');
}
```

`apps/server/src/documents/share-links.ts`: delete `hashShareToken` and `TOKEN_DIGEST`'s hash use, import `hashToken` from `../auth/token-hash`, replace the three call sites; keep `deriveShareToken` (it uses the HMAC digest name, so keep `TOKEN_DIGEST` there). Move the hash test out of `share-links.test.ts`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter @superdoc-history/server exec vitest run src/auth src/documents/share-links.test.ts src/documents/share-links-routes.test.ts && pnpm typecheck`
Expected: PASS; typecheck green for `libs/types` and `apps/server` (web is fixed in Task 7).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/database/schema/auth.ts apps/server/src/database/schema/invites.ts apps/server/drizzle apps/server/src/auth/auth.ts apps/server/better-auth.config.ts apps/server/src/auth/session.ts apps/server/src/auth/token-hash.ts apps/server/src/auth/token-hash.test.ts apps/server/src/auth/session.test.ts apps/server/src/documents/share-links.ts apps/server/src/documents/share-links.test.ts
git commit -m "feat(server): user roles via the Better Auth admin plugin, invites table, shared token hash"
```

---

### Task 3: InvitesRepository (G2)

**Files:**
- Create: `apps/server/src/admin/invites.ts`
- Test: `apps/server/src/admin/invites.test.ts`

**Interfaces:**
- Consumes: `invites` schema (Task 2), `hashToken` (Task 2), `InviteState`, `inviteStateOf`, `INVITE_TTL_MS`, `InviteSummary` (Task 1), `AuthDatabase`.
- Produces:
  ```ts
  export class InvitesRepository {
    constructor({ database, appOrigin, now }: { database: AuthDatabase; appOrigin: string; now: () => number });
    create({ createdBy }: { createdBy: string }): CreatedInvite;           // url = `${appOrigin}${signUpPagePath(token)}`
    list(): InviteSummary[];                                                // newest first
    resolvePending(token: string): { id: string } | null;                   // only Pending
    accept({ id, userId }: { id: string; userId: string }): boolean;        // false when it stopped being pending
    revoke(id: string): RevokeOutcome;                                      // enum: Revoked | NotFound | AlreadyAccepted
    hasAnyUser(): boolean;                                                  // claim check lives here too, one query
  }
  export enum RevokeOutcome { Revoked = 'revoked', NotFound = 'not-found', AlreadyAccepted = 'already-accepted' }
  ```

- [ ] **Step 1: Write the failing tests**

`apps/server/src/admin/invites.test.ts` (open an in-memory auth database the way `documents-repository.test.ts` or `share-links-routes.test.ts` does; if no repository-level helper exists, use `startTestServer()` and `server.database`):

```ts
import { DAY_MS, INVITE_TTL_MS, InviteState } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { startTestServer } from '../testing/test-server';
import { InvitesRepository, RevokeOutcome } from './invites';

const NOW = Date.UTC(2026, 9, 17, 12, 0);

async function repositoryWithAdmin(now: () => number) {
  const server = await startTestServer();
  const repository = new InvitesRepository({ database: server.database, appOrigin: server.baseUrl, now });
  return { server, repository, adminId: server.admin.id };
}

test('create returns a sign-up URL once and stores only the hash', async () => {
  const { server, repository, adminId } = await repositoryWithAdmin(() => NOW);
  const invite = repository.create({ createdBy: adminId });
  const token = new URL(invite.url).searchParams.get('invite') as string;
  expect(invite.url.startsWith(`${server.baseUrl}/sign-up?invite=`)).toBe(true);
  expect(invite.expiresAt).toBe(NOW + INVITE_TTL_MS);
  const rows = server.database.sqlite.prepare('select token_hash from invites').all() as { token_hash: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]!.token_hash).not.toContain(token);
  expect(repository.resolvePending(token)).toEqual({ id: invite.id });
  await server.stop();
});

test('an accepted invite stops resolving and accept is single use', async () => {
  const { server, repository, adminId } = await repositoryWithAdmin(() => NOW);
  const invite = repository.create({ createdBy: adminId });
  const token = new URL(invite.url).searchParams.get('invite') as string;
  expect(repository.accept({ id: invite.id, userId: adminId })).toBe(true);
  expect(repository.accept({ id: invite.id, userId: adminId })).toBe(false);
  expect(repository.resolvePending(token)).toBeNull();
  expect(repository.list()[0]?.state).toBe(InviteState.Accepted);
  await server.stop();
});

test('revoke marks a pending invite, refuses an accepted one and reports unknown ids', async () => {
  const { server, repository, adminId } = await repositoryWithAdmin(() => NOW);
  const pending = repository.create({ createdBy: adminId });
  const accepted = repository.create({ createdBy: adminId });
  repository.accept({ id: accepted.id, userId: adminId });
  expect(repository.revoke(pending.id)).toBe(RevokeOutcome.Revoked);
  expect(repository.revoke(accepted.id)).toBe(RevokeOutcome.AlreadyAccepted);
  expect(repository.revoke('nope')).toBe(RevokeOutcome.NotFound);
  expect(repository.list().map((invite) => invite.state)).toEqual([InviteState.Accepted, InviteState.Revoked]);
  await server.stop();
});

test('an invite expires after seven days', async () => {
  const clock = { now: NOW };
  const { server, repository, adminId } = await repositoryWithAdmin(() => clock.now);
  const invite = repository.create({ createdBy: adminId });
  const token = new URL(invite.url).searchParams.get('invite') as string;
  clock.now = NOW + INVITE_TTL_MS;
  expect(repository.resolvePending(token)).toBeNull();
  expect(repository.list()[0]?.state).toBe(InviteState.Expired);
  clock.now = NOW + INVITE_TTL_MS - DAY_MS;
  expect(repository.resolvePending(token)).toEqual({ id: invite.id });
  await server.stop();
});

test('list names the creator and the acceptor', async () => {
  const { server, repository, adminId } = await repositoryWithAdmin(() => NOW);
  const invite = repository.create({ createdBy: adminId });
  repository.accept({ id: invite.id, userId: adminId });
  expect(repository.list()[0]).toMatchObject({ createdBy: { name: 'Admin' }, acceptedBy: { name: 'Admin' } });
  await server.stop();
});
```

`server.admin` does not exist yet: Task 4 adds it. For this task, replace `server.admin.id` with the id of a user created through `signedInUser({ server, name: 'Admin' })` and expect `createdBy: { name: 'Admin' }`; Task 4 switches the helper.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @superdoc-history/server exec vitest run src/admin/invites.test.ts`
Expected: FAIL, `Cannot find module './invites'`.

- [ ] **Step 3: Implement**

`apps/server/src/admin/invites.ts`:

```ts
import { randomBytes, randomUUID } from 'node:crypto';
import { INVITE_TTL_MS, InviteState, inviteStateOf, signUpPagePath, type CreatedInvite, type InviteSummary } from '@superdoc-history/types';
import { alias } from 'drizzle-orm/sqlite-core';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
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
      .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date(this.now()))))
      .get();
    if (!row) return null;
    return row;
  }

  accept({ id, userId }: { id: string; userId: string }): boolean {
    const result = this.database.drizzle
      .update(invites)
      .set({ acceptedBy: userId, acceptedAt: new Date(this.now()) })
      .where(and(eq(invites.id, id), isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date(this.now()))))
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
      .orderBy(desc(invites.createdAt))
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
}

function timeOf(value: Date | null): number | null {
  if (value === null) return null;
  return value.getTime();
}

function acceptorOf(name: string | null): { name: string } | null {
  if (name === null) return null;
  return { name };
}
```

(`InviteState` import stays only if used; drop unused imports before committing.)

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superdoc-history/server exec vitest run src/admin/invites.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/admin/invites.ts apps/server/src/admin/invites.test.ts
git commit -m "feat(server): invites repository with hashed single-use tokens"
```

---

### Task 4: Sign-up gate, claim, invite consumption, test-server claim, seed (G2)

**Files:**
- Modify: `apps/server/src/auth/auth.ts`
- Create: `apps/server/src/auth/sign-up-gate.ts`
- Modify: `apps/server/src/server.ts` (construct `InvitesRepository` before `createAuth`, pass it)
- Modify: `apps/server/src/testing/test-server.ts`, `apps/server/src/testing/collaboration-client.ts`
- Modify: `apps/server/src/auth/seed-demo-users.ts`, `apps/server/src/seed.ts`, `libs/types/src/demo-users.ts` (add `DEMO_ADMIN`)
- Test: `apps/server/src/auth/sign-up-gate.test.ts`, `apps/server/src/auth/seed-demo-users.test.ts`

**Interfaces:**
- Consumes: `InvitesRepository` (Task 3), `SIGN_UP_BY_INVITATION_MESSAGE`, `INVITE_TOKEN_HEADER`, `UserRole` (Task 1).
- Produces:
  - `createAuth({ database, environment, invites })` (new required `invites: InvitesRepository`).
  - `createSignUpGate({ invites, database })` returning `{ before: AuthMiddleware; after: AuthMiddleware }` composed into the existing hooks.
  - `TestServer.admin: TestUser` (claimed at start unless `startTestServer({ claim: false })`).
  - `signInAndGetCookie` sends `x-invite-token` from `server.services.invites.create({ createdBy: server.admin.id })`.
  - `DEMO_ADMIN = { name: 'Admin', email: 'admin@example.com' }` in `libs/types`; seed creates it first (claim) then the four demo users through invites.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/auth/sign-up-gate.test.ts`:

```ts
import { ApiPath, HttpStatus, INVITE_TOKEN_HEADER, SIGN_UP_BY_INVITATION_MESSAGE, UserRole } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { currentUserId, signInExisting, startTestServer, TEST_USER_PASSWORD, type TestServer } from '../testing/test-server';

let clientAddress = 1;

function signUp({ server, email, token }: { server: TestServer; email: string; token?: string }): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.201.0.${clientAddress++}` };
  if (token) headers[INVITE_TOKEN_HEADER] = token;
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-up/email`, { method: 'POST', headers, body: JSON.stringify({ name: 'Eve', email, password: TEST_USER_PASSWORD }) });
}

function tokenOf(url: string): string {
  return new URL(url).searchParams.get('invite') as string;
}

test('the first sign-up on an unclaimed instance becomes admin', async () => {
  const server = await startTestServer({ claim: false });
  expect((await signUp({ server, email: 'first@example.com' })).status).toBe(HttpStatus.Ok);
  const cookie = await signInExisting({ server, email: 'first@example.com', password: TEST_USER_PASSWORD });
  const me = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie } });
  expect(((await me.json()) as { user: { role: string } }).user.role).toBe(UserRole.Admin);
  await server.stop();
});

test('a sign-up without a token on a claimed instance is refused and creates no user', async () => {
  const server = await startTestServer();
  const response = await signUp({ server, email: 'eve@example.com' });
  expect(response.status).toBe(HttpStatus.Forbidden);
  expect(await response.json()).toMatchObject({ message: SIGN_UP_BY_INVITATION_MESSAGE });
  expect(server.database.sqlite.prepare("select count(*) as n from user where email = 'eve@example.com'").get()).toEqual({ n: 0 });
  await server.stop();
});

test('a pending token admits a user, is consumed, and the user is not admin', async () => {
  const server = await startTestServer();
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  expect((await signUp({ server, email: 'eve@example.com', token: tokenOf(invite.url) })).status).toBe(HttpStatus.Ok);
  expect((await signUp({ server, email: 'eve2@example.com', token: tokenOf(invite.url) })).status).toBe(HttpStatus.Forbidden);
  const cookie = await signInExisting({ server, email: 'eve@example.com', password: TEST_USER_PASSWORD });
  const userId = await currentUserId({ server, cookie });
  expect(server.services.invites.list()[0]).toMatchObject({ state: 'accepted', acceptedBy: { name: 'Eve' } });
  expect(server.database.sqlite.prepare('select role from user where id = ?').get(userId)).toEqual({ role: UserRole.User });
  await server.stop();
});

test.each(['revoked', 'expired', 'unknown'] as const)('a %s token is refused', async (kind) => {
  const clock = { now: Date.now() };
  const server = await startTestServer({ now: () => clock.now });
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  if (kind === 'revoked') server.services.invites.revoke(invite.id);
  if (kind === 'expired') clock.now += 8 * 24 * 60 * 60 * 1000;
  const token = kind === 'unknown' ? 'not-a-token' : tokenOf(invite.url);
  expect((await signUp({ server, email: 'eve@example.com', token })).status).toBe(HttpStatus.Forbidden);
  await server.stop();
});

test('a token consumed between the check and the submit creates no user', async () => {
  const server = await startTestServer();
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  const token = tokenOf(invite.url);
  const [first, second] = await Promise.all([signUp({ server, email: 'a@example.com', token }), signUp({ server, email: 'b@example.com', token })]);
  expect([first.status, second.status].sort()).toEqual([HttpStatus.Ok, HttpStatus.Forbidden]);
  expect(server.database.sqlite.prepare("select count(*) as n from user where email in ('a@example.com','b@example.com')").get()).toEqual({ n: 1 });
  await server.stop();
});

test('two concurrent first sign-ups leave one admin', async () => {
  const server = await startTestServer({ claim: false });
  await Promise.all([signUp({ server, email: 'a@example.com' }), signUp({ server, email: 'b@example.com' })]);
  const roles = server.database.sqlite.prepare('select role from user order by created_at, id').all() as { role: string }[];
  expect(roles.filter((row) => row.role === UserRole.Admin)).toHaveLength(1);
  await server.stop();
});
```

`apps/server/src/auth/seed-demo-users.test.ts`, add:

```ts
test('the seed claims the instance with the admin and admits the demo users by invite', async () => {
  const server = await startTestServer({ claim: false });
  const result = await seedDemoUsers({ auth: server.auth, database: server.database, invites: server.services.invites, password: TEST_USER_PASSWORD });
  expect(result.created[0]).toBe(DEMO_ADMIN.email);
  const roles = server.database.sqlite.prepare('select email, role from user order by created_at, id').all();
  expect(roles[0]).toEqual({ email: DEMO_ADMIN.email, role: UserRole.Admin });
  expect(roles.slice(1).every((row) => (row as { role: string }).role === UserRole.User)).toBe(true);
  const again = await seedDemoUsers({ auth: server.auth, database: server.database, invites: server.services.invites, password: TEST_USER_PASSWORD });
  expect(again.created).toEqual([]);
  await server.stop();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @superdoc-history/server exec vitest run src/auth/sign-up-gate.test.ts src/auth/seed-demo-users.test.ts`
Expected: FAIL on `startTestServer({ claim: false })` (unknown option is ignored by TypeScript at runtime, so the first failure is `expected 200 to be 403` in the second test, because nothing refuses yet).

- [ ] **Step 3: The gate**

`apps/server/src/auth/sign-up-gate.ts`:

```ts
import { INVITE_TOKEN_HEADER, SIGN_UP_BY_INVITATION_MESSAGE, UserRole } from '@superdoc-history/types';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { asc, eq } from 'drizzle-orm';
import type { InvitesRepository } from '../admin/invites';
import type { AuthDatabase } from '../database/connection';
import { user } from '../database/schema/auth';

export const SIGN_UP_PATH = '/sign-up/email';

type CreatedUser = { id: string };

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

export function createSignUpGate({ invites, database }: { invites: InvitesRepository; database: AuthDatabase }) {
  const before = createAuthMiddleware(async (context) => {
    if (context.path !== SIGN_UP_PATH) return;
    if (!invites.hasAnyUser()) return;
    const token = inviteTokenOf(context.headers);
    if (token && invites.resolvePending(token)) return;
    throw new APIError('FORBIDDEN', { message: SIGN_UP_BY_INVITATION_MESSAGE });
  });

  const after = createAuthMiddleware(async (context) => {
    if (context.path !== SIGN_UP_PATH) return;
    const created = createdUserOf(context.context.returned);
    if (!created) return;
    const token = inviteTokenOf(context.headers);
    if (token) return consumeInvite({ invites, database, token, userId: created.id });
    promoteEarliestUser({ database, userId: created.id });
  });

  return { before, after };
}

function consumeInvite({ invites, database, token, userId }: { invites: InvitesRepository; database: AuthDatabase; token: string; userId: string }): void {
  const pending = invites.resolvePending(token);
  if (pending && invites.accept({ id: pending.id, userId })) return;
  database.drizzle.delete(user).where(eq(user.id, userId)).run();
  throw new APIError('FORBIDDEN', { message: SIGN_UP_BY_INVITATION_MESSAGE });
}

function promoteEarliestUser({ database, userId }: { database: AuthDatabase; userId: string }): void {
  const earliest = database.drizzle.select({ id: user.id }).from(user).orderBy(asc(user.createdAt), asc(user.id)).limit(1).get();
  if (!earliest || earliest.id !== userId) return;
  database.drizzle.update(user).set({ role: UserRole.Admin }).where(eq(user.id, userId)).run();
}
```

Note on the race in `consumeInvite`: `accept` is a conditional update, so of two requests holding the same token only one changes a row; the other deletes its own fresh user and answers 403. The `after` hook runs before the session cookie is written? It does not: Better Auth has already set the cookie by the time `after` runs, so the 403 response still carries a `set-cookie` for a deleted user. The session row cascades on user delete, so the cookie is dead; the test checks the user count, which is what matters.

`apps/server/src/auth/auth.ts`: compose the hooks.

```ts
import { createSignUpGate } from './sign-up-gate';

type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;

function sequence(middlewares: AuthMiddleware[]): AuthMiddleware {
  return createAuthMiddleware(async (context) =>
    middlewares.reduce<Promise<unknown>>(async (previous, middleware) => {
      const returned = await middleware(context);
      if (returned !== undefined) return returned;
      return previous;
    }, Promise.resolve(undefined)),
  );
}

export function createAuth({ database, environment, invites }: { database: AuthDatabase; environment: Environment; invites: InvitesRepository }) {
  const gate = createSignUpGate({ invites, database });
  return betterAuth({
    ...
    hooks: { before: sequence([normalizeCredentials, gate.before]), after: sequence([gate.after, omitSessionToken]) },
```

`normalizeCredentials` returns a modified context and the gate returns nothing, so `sequence` keeps the last defined return value; a test in `sign-up-gate.test.ts` ("a valid sign-in still normalises its body through the sequence") signs in with an upper-case e-mail and expects 200, which only passes when the normalised body survives the sequence.

`apps/server/src/server.ts`: build `const invites = new InvitesRepository({ database, appOrigin: environment.appOrigin, now: Date.now })` right after `database` opens and before `createAuth`; pass `invites` into `createAuth` and into `services` (`services.invites`).

- [ ] **Step 4: Test server claim and seed**

`apps/server/src/testing/test-server.ts`:

- `startTestServer({ claim = true, now, ... } = {})`: after the app is listening, when `claim` is true, sign up `DEMO_ADMIN` through `postCredentials` with no token, sign in, and expose `server.admin: TestUser`. When `claim` is false, `server.admin` throws on access: define it as a getter that throws `new Error('startTestServer({ claim: false }) has no admin.')`.
- `now` is passed to `InvitesRepository` (default `Date.now`).
- `signInAndGetCookie`: before posting sign-up, `const invite = server.services.invites.create({ createdBy: server.admin.id })` and send `[INVITE_TOKEN_HEADER]: tokenOf(invite.url)`.
- `TestServer` gains `admin: TestUser`.

`apps/server/src/testing/collaboration-client.ts`: `memberWithRole` goes through `signedInUser`, so nothing changes; confirm by reading it.

`libs/types/src/demo-users.ts`: add `export const DEMO_ADMIN = { name: 'Admin', email: 'admin@example.com' };` (G1 owns the file; developer-2 makes this one-line change and says so in the commit).

`apps/server/src/auth/seed-demo-users.ts`:

```ts
export async function seedDemoUsers({ auth, database, invites, password }: { auth: Auth; database: AuthDatabase; invites: InvitesRepository; password: string }): Promise<SeedResult> {
  const result: SeedResult = { created: [], existing: [] };
  const adminId = await seedOne({ auth, database, result, account: DEMO_ADMIN, password, headers: new Headers() });
  const adminHeaders = () => new Headers({ [INVITE_TOKEN_HEADER]: tokenOf(invites.create({ createdBy: adminId }).url) });
  await DEMO_USERS.reduce(async (previous, account) => {
    await previous;
    await seedOne({ auth, database, result, account, password, headers: adminHeaders() });
  }, Promise.resolve());
  return result;
}
```

with `seedOne` doing the existing "select by email, else `auth.api.signUpEmail({ body, headers })`" and returning the user id (existing or created). `auth.api.signUpEmail` accepts `headers`, which is how the token reaches the gate. An invite is created only when the account is missing: move `invites.create` inside `seedOne`'s create branch (pass `invites` and `adminId` instead of `headers`) so re-runs create no invites.

`apps/server/src/seed.ts`: construct `InvitesRepository` and pass it.

- [ ] **Step 5: Run the whole server suite and typecheck**

Run: `pnpm --filter @superdoc-history/server test:unit && pnpm typecheck`
Expected: PASS, including every pre-existing test (they now sign up through invites) and the six new gate tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/auth/sign-up-gate.ts apps/server/src/auth/sign-up-gate.test.ts apps/server/src/auth/auth.ts apps/server/src/server.ts apps/server/src/testing/test-server.ts apps/server/src/auth/seed-demo-users.ts apps/server/src/auth/seed-demo-users.test.ts apps/server/src/seed.ts libs/types/src/demo-users.ts
git commit -m "feat(server): first sign-up claims the instance, later ones need a pending invite"
```

---

### Task 5: Setup, invite and admin routes (G2)

**Files:**
- Create: `apps/server/src/admin/setup-routes.ts`, `apps/server/src/admin/invite-routes.ts`, `apps/server/src/admin/admin-routes.ts`, `apps/server/src/admin/users.ts` (AdminUsersRepository: `list()`, `setRole({ id, role })`, `countAdmins()`)
- Create: `apps/server/src/http/require-admin.ts`
- Modify: `apps/server/src/http/app.ts`
- Test: `apps/server/src/admin/setup-routes.test.ts`, `apps/server/src/admin/invite-routes.test.ts`, `apps/server/src/admin/admin-routes.test.ts`

**Interfaces:**
- Consumes: `InvitesRepository`, `requireUser`, `SignedIn`, `HttpStatus`, `AdminResource`, `adminApiPath`, `inviteApiPath`.
- Produces: the routes in the spec table; `services.adminUsers: AdminUsersRepository`; `requireAdmin()` middleware (after `requireUser`), answering `{ error: 'Admins only' }` 403; `ADMINS_ONLY_MESSAGE`, `LAST_ADMIN_MESSAGE = 'The last admin cannot be demoted.'`, `INVITE_ALREADY_ACCEPTED_MESSAGE = 'An accepted invite cannot be revoked.'`, `INVITE_NOT_FOUND_MESSAGE = 'This invite is not valid.'` exported from `libs/types/src/invites.ts` (G1 file; developer-2 adds the constants and says so).

- [ ] **Step 1: Write the failing tests**

`apps/server/src/admin/setup-routes.test.ts`:

```ts
test('setup reports unclaimed, then claimed after the first sign-up', async () => {
  const server = await startTestServer({ claim: false });
  expect(await (await fetch(`${server.baseUrl}${ApiPath.Setup}`)).json()).toEqual({ claimed: false });
  await signInAndGetCookie({ server, credentials: { name: 'First', email: 'first@example.com', password: TEST_USER_PASSWORD } });
  expect(await (await fetch(`${server.baseUrl}${ApiPath.Setup}`)).json()).toEqual({ claimed: true });
  await server.stop();
});
```

(`signInAndGetCookie` on an unclaimed server must skip the invite: make it `if (server.hasAdmin)`; add `hasAdmin: boolean` to `TestServer`.)

`apps/server/src/admin/invite-routes.test.ts`:

```ts
test('a pending token answers pending; dead tokens answer 404 alike', async () => {
  const server = await startTestServer();
  const invite = server.services.invites.create({ createdBy: server.admin.id });
  const token = tokenOf(invite.url);
  expect(await (await fetch(`${server.baseUrl}${inviteApiPath(token)}`)).json()).toEqual({ state: InviteState.Pending });
  server.services.invites.revoke(invite.id);
  expect((await fetch(`${server.baseUrl}${inviteApiPath(token)}`)).status).toBe(HttpStatus.NotFound);
  expect((await fetch(`${server.baseUrl}${inviteApiPath('nope')}`)).status).toBe(HttpStatus.NotFound);
  await server.stop();
});
```

`apps/server/src/admin/admin-routes.test.ts`:

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

test('an admin creates an invite, sees it pending, and the URL admits one sign-up', async () => {
  const server = await startTestServer();
  const created = await call({ server, method: HttpMethod.Post, path: adminApiPath(AdminResource.Invites), cookie: server.admin.cookie });
  expect(created.status).toBe(HttpStatus.Created);
  const invite = (await created.json()) as CreatedInvite;
  expect(invite.url.startsWith(`${server.baseUrl}/sign-up?invite=`)).toBe(true);
  const list = (await (await call({ server, method: HttpMethod.Get, path: adminApiPath(AdminResource.Invites), cookie: server.admin.cookie })).json()) as InviteSummary[];
  expect(list[0]).toMatchObject({ id: invite.id, state: InviteState.Pending, createdBy: { name: 'Admin' }, acceptedBy: null });
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

test('an admin promotes and demotes another user, and the last admin cannot be demoted', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  const setRole = ({ id, role, cookie }: { id: string; role: UserRole; cookie: string }) =>
    call({ server, method: HttpMethod.Post, path: `${adminApiPath(AdminResource.Users)}/${id}/role`, cookie, body: { role } });
  expect((await setRole({ id: eve.id, role: UserRole.Admin, cookie: server.admin.cookie })).status).toBe(HttpStatus.Ok);
  expect((await setRole({ id: server.admin.id, role: UserRole.User, cookie: eve.cookie })).status).toBe(HttpStatus.Ok);
  const self = await setRole({ id: eve.id, role: UserRole.User, cookie: eve.cookie });
  expect(self.status).toBe(HttpStatus.Conflict);
  expect(await self.json()).toEqual({ error: LAST_ADMIN_MESSAGE });
  expect((await setRole({ id: 'nope', role: UserRole.User, cookie: eve.cookie })).status).toBe(HttpStatus.NotFound);
  expect((await setRole({ id: eve.id, role: 'king' as UserRole, cookie: eve.cookie })).status).toBe(HttpStatus.BadRequest);
  await server.stop();
});
```

`call` is a local helper: `fetch(${server.baseUrl}${path}, { method, headers: { cookie, 'content-type': 'application/json', origin: server.baseUrl }, body: JSON.stringify(body) })`; the `origin` header satisfies the CSRF middleware (see how `share-links-routes.test.ts` posts).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @superdoc-history/server exec vitest run src/admin`
Expected: FAIL, 404s where 200/401/403 are expected.

- [ ] **Step 3: Implement**

`apps/server/src/http/require-admin.ts`:

```ts
import { ADMINS_ONLY_MESSAGE, HttpStatus, UserRole } from '@superdoc-history/types';
import { createMiddleware } from 'hono/factory';
import type { SignedIn } from './require-user';

export function requireAdmin() {
  return createMiddleware<SignedIn>(async (context, next) => {
    if (context.var.user.role !== UserRole.Admin) return context.json({ error: ADMINS_ONLY_MESSAGE }, HttpStatus.Forbidden);
    await next();
  });
}
```

`apps/server/src/admin/users.ts`:

```ts
export class AdminUsersRepository {
  private readonly database: AuthDatabase;

  constructor(database: AuthDatabase) {
    this.database = database;
  }

  list(): AdminUser[] {
    return this.database.drizzle.select({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt }).from(user).orderBy(asc(user.createdAt), asc(user.id)).all()
      .map((row) => ({ ...row, role: row.role as UserRole, createdAt: row.createdAt.getTime() }));
  }
  countAdmins(): number {
    return this.database.drizzle.select({ id: user.id }).from(user).where(eq(user.role, UserRole.Admin)).all().length;
  }
  setRole({ id, role }: { id: string; role: UserRole }): SetRoleOutcome {
    const row = this.database.drizzle.select({ role: user.role }).from(user).where(eq(user.id, id)).get();
    if (!row) return SetRoleOutcome.NotFound;
    if (row.role === UserRole.Admin && role === UserRole.User && this.countAdmins() === 1) return SetRoleOutcome.LastAdmin;
    this.database.drizzle.update(user).set({ role }).where(eq(user.id, id)).run();
    return SetRoleOutcome.Updated;
  }
}
export enum SetRoleOutcome { Updated = 'updated', NotFound = 'not-found', LastAdmin = 'last-admin' }
```

`apps/server/src/admin/setup-routes.ts`: `routes.get(ApiPath.Setup, (context) => context.json({ claimed: invites.hasAnyUser() }))`.

`apps/server/src/admin/invite-routes.ts`: `routes.get(`${ApiPath.Invites}/:token`, ...)`: `resolvePending(token)` → `{ state: InviteState.Pending }` or `{ error: INVITE_NOT_FOUND_MESSAGE }` with 404.

`apps/server/src/admin/admin-routes.ts` (mounted at `ApiPath.Admin`): `GET /users`, `POST /users/:id/role` (body parsed with `z.object({ role: z.nativeEnum(UserRole) })`, outcomes → 200 `{ id, role }` / 404 / 409 `{ error: LAST_ADMIN_MESSAGE }`), `GET /invites`, `POST /invites` → 201 `CreatedInvite` with `createdBy: context.var.user.id`, `DELETE /invites/:id` → 204 / 409 `{ error: INVITE_ALREADY_ACCEPTED_MESSAGE }` / 404 `{ error: INVITE_NOT_FOUND_MESSAGE }`.

`apps/server/src/http/app.ts`:

```ts
  app.use(`${ApiPath.Admin}/*`, sameOriginOnly);
  app.use(`${ApiPath.Admin}/*`, signedIn);
  app.use(`${ApiPath.Admin}/*`, requireAdmin());
  app.route('/', createSetupRoutes({ services }));
  app.route('/', createInviteRoutes({ services }));
  app.route(ApiPath.Admin, createAdminRoutes({ services }));
```

`services` gains `adminUsers` (constructed in `server.ts`).

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm --filter @superdoc-history/server exec vitest run src/admin src/http && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/admin apps/server/src/http/require-admin.ts apps/server/src/http/app.ts apps/server/src/server.ts libs/types/src/invites.ts
git commit -m "feat(server): setup status, invite lookup and the admin routes"
```

---

### Task 6: Recovery script `admin:promote` (G2)

**Files:**
- Create: `apps/server/src/admin/promote.ts`
- Modify: `apps/server/package.json` (`"admin:promote": "node dist/admin/promote.js"` next to `seed`; the build already compiles `src/**`)
- Test: `apps/server/src/admin/promote.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('promote sets the role of an existing email and reports unknown emails', async () => {
  const server = await startTestServer();
  const eve = await signedInUser({ server, name: 'Eve' });
  expect(promoteByEmail({ database: server.database, email: eve.email })).toBe(PromoteOutcome.Promoted);
  expect(server.database.sqlite.prepare('select role from user where id = ?').get(eve.id)).toEqual({ role: UserRole.Admin });
  expect(promoteByEmail({ database: server.database, email: 'nobody@example.com' })).toBe(PromoteOutcome.NotFound);
  await server.stop();
});
```

- [ ] **Step 2: Run it to verify it fails** — `Cannot find module './promote'`.

- [ ] **Step 3: Implement**

`apps/server/src/admin/promote.ts`:

```ts
import { pathToFileURL } from 'node:url';
import { UserRole } from '@superdoc-history/types';
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
    console.error('Usage: admin:promote <email>');
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

- [ ] **Step 4: Run the test** — PASS.

- [ ] **Step 5: Commit** — `feat(server): admin:promote recovers an instance without an admin`.

---

### Task 7: Web auth pages: setup state, invite state, role in session, 403 message (G3)

**Files:**
- Modify: `apps/web/src/features/auth/use-session.ts` (type only: `role` comes with `SessionUser`)
- Create: `apps/web/src/features/auth/use-setup.ts`, `apps/web/src/features/auth/use-invite.ts`, `apps/web/src/features/auth/setup-api.ts`
- Modify: `apps/web/src/features/auth/sign-in-page.tsx`, `sign-up-page.tsx`, `auth-copy.ts`, `auth-failure.ts`, `use-auth-submit.ts`
- Modify: every web test fixture that builds a `SessionUser` (`grep -rn "email:" apps/web/src --include=*.test.tsx` → add `role: UserRole.User`)
- Test: `apps/web/src/features/auth/sign-up-page.test.tsx` (new), `sign-in-page.test.tsx`, `use-auth-submit.test.tsx`

**Interfaces:**
- Consumes: `SetupStatus`, `InviteStatus`, `INVITE_QUERY_PARAMETER`, `INVITE_TOKEN_HEADER`, `inviteApiPath`, `ApiPath.Setup`, `SIGN_UP_BY_INVITATION_MESSAGE` (Task 1).
- Produces:
  - `useSetup(): UseQueryResult<SetupStatus>` (`SETUP_QUERY_KEY = ['setup']`)
  - `useInvite(token: string | null): UseQueryResult<InviteStatus>` (enabled only with a token; a 404 rejects with `InviteNotValidError`, and the page treats `isError` as "not valid")
  - `authFailureMessage({ status, retryAfterSeconds, serverMessage })`: 403 → `serverMessage`
  - `useAuthSubmit` passes `error.message` as `serverMessage` and accepts `headers?: Record<string, string>` merged into the `fetchOptions`
  - copy: `CLAIM_TITLE = 'Claim this instance'`, `CLAIM_DESCRIPTION = 'The first account becomes the administrator.'`, `INVITED_TITLE = 'You were invited'`, `INVITED_DESCRIPTION = 'Create your account to join.'`, `INVITE_INVALID_MESSAGE = 'This invite is not valid. Ask an admin for a new link.'`, `CLAIM_LINK_LABEL = 'Claim this instance'`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/auth/sign-up-page.test.tsx` (mock `fetch` like `documents-page.test.tsx`, mock `./auth-client` like `sign-in-page.test.tsx`):

```tsx
function mockApi({ claimed, inviteStatus }: { claimed: boolean; inviteStatus: number }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return new Response(JSON.stringify({ user: null }));
    if (input === ApiPath.Setup) return new Response(JSON.stringify({ claimed }));
    if (String(input).startsWith(ApiPath.Invites)) return new Response(JSON.stringify({ state: InviteState.Pending }), { status: inviteStatus });
    throw new Error(`unexpected ${String(input)}`);
  });
}

test('an unclaimed instance offers to claim it', async () => {
  mockApi({ claimed: false, inviteStatus: HttpStatus.NotFound });
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  expect(await screen.findByRole('heading', { name: CLAIM_TITLE })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SIGN_UP_LABEL })).toBeInTheDocument();
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

test('submitting sends the token in the header and a forbidden sign-up shows the server message', async () => {
  mockApi({ claimed: true, inviteStatus: HttpStatus.Ok });
  signUpEmail.mockResolvedValue({ data: null, error: { status: HttpStatus.Forbidden, message: SIGN_UP_BY_INVITATION_MESSAGE } });
  renderWithProviders(<SignUpPage />, { route: signUpPagePath('tok') });
  await userEvent.type(await screen.findByLabelText('Name'), 'Eve');
  await userEvent.type(screen.getByLabelText('Email'), 'eve@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'long-enough-password');
  await userEvent.click(screen.getByRole('button', { name: SIGN_UP_LABEL }));
  expect(await screen.findByText(SIGN_UP_BY_INVITATION_MESSAGE)).toBeInTheDocument();
  expect(signUpEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'eve@example.com' }), expect.objectContaining({ headers: { [INVITE_TOKEN_HEADER]: 'tok' } }));
});
```

`sign-in-page.test.tsx`, add: "shows the claim link while unclaimed and no sign-up link once claimed" (two renders, `mockApi` with `claimed` false then true; assert `screen.findByRole('link', { name: CLAIM_LINK_LABEL })` then `queryByRole('link', { name: /sign up/i })` is null).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/auth`
Expected: FAIL (`CLAIM_TITLE` undefined, headings missing).

- [ ] **Step 3: Implement**

`setup-api.ts`: `fetchSetup(): Promise<SetupStatus>` and `fetchInvite(token): Promise<InviteStatus>` using `apiGet`; non-ok throws `ApiRequestError` (`InviteNotValidError extends ApiRequestError` for the invite).

`use-setup.ts`: `useQuery({ queryKey: SETUP_QUERY_KEY, queryFn: fetchSetup })`. `use-invite.ts`: `useQuery({ queryKey: [...INVITE_QUERY_KEY, token], queryFn: () => fetchInvite(token as string), enabled: token !== null, retry: false })`.

`sign-up-page.tsx`:

```tsx
export function SignUpPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get(INVITE_QUERY_PARAMETER);
  const setup = useSetup();
  const invite = useInvite(token);
  if (!setup.data) return <SessionSkeleton />;
  if (!setup.data.claimed) return <SignUpCard title={CLAIM_TITLE} description={CLAIM_DESCRIPTION} token={null} />;
  if (token === null) return <InviteInvalid />;
  if (invite.isPending) return <SessionSkeleton />;
  if (invite.isError) return <InviteInvalid />;
  return <SignUpCard title={INVITED_TITLE} description={INVITED_DESCRIPTION} token={token} />;
}
```

`SignUpCard` is the existing card and form, taking `title`, `description` and `token`; it calls `useAuthSubmit({ form, request: (values, options) => authClient.signUp.email(values, options), headers: headersFor(token) })` where `headersFor(null)` is `{}` and `headersFor(token)` is `{ [INVITE_TOKEN_HEADER]: token }`. `InviteInvalid` is a card with `INVITE_INVALID_MESSAGE` and a "Sign in" link.

`use-auth-submit.ts`: add `headers` to the parameters, merge into the capture object passed to the request (`{ headers, onResponse }`), extend `AuthRequestResult.error` with `message: string`, and call `authFailureMessage({ status, retryAfterSeconds, serverMessage: error.message })`.

`auth-failure.ts`: `if (status === HttpStatus.Forbidden) return serverMessage;`.

`sign-in-page.tsx`: `const setup = useSetup();` and render the footer link only when `setup.data?.claimed === false` (`setup.data` undefined renders nothing in the footer, never a sign-up link).

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm --filter @superdoc-history/web test:unit && pnpm typecheck`
Expected: PASS; typecheck green across the workspace (every fixture now has `role`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth
git add $(git diff --name-only | grep -E 'apps/web/src/.*\.test\.tsx$')
git commit -m "feat(web): claim and invited sign-up states, setup-aware sign-in, forbidden message"
```

---

### Task 8: Admin page, role guard, header link (G3)

**Files:**
- Create: `apps/web/src/features/admin/admin-api.ts`, `use-admin-users.ts`, `use-invites.ts`, `admin-page.tsx`, `users-table.tsx`, `invites-table.tsx`, `admin-copy.ts`, `require-admin.tsx`
- Modify: `apps/web/src/app/router.tsx`, `apps/web/src/features/documents/documents-page.tsx`, `apps/web/src/testing/render-with-providers.tsx` (mount `<Toaster />`)
- Test: `apps/web/src/features/admin/admin-page.test.tsx`, `require-admin.test.tsx`, `apps/web/src/features/documents/documents-page.test.tsx` (header link)

**Interfaces:**
- Consumes: `AdminUser`, `InviteSummary`, `CreatedInvite`, `adminApiPath`, `AdminResource`, `UserRole`, `InviteState`, `formatTimestamp` (`apps/web/src/lib/format-date-time.ts`), `toast` from `sonner`.
- Produces: `ADMIN_LINK_LABEL = 'Admin'`, `ADMINS_ONLY_TOAST = 'Admins only'`, `GENERATE_INVITE_LABEL = 'Generate invite'`, `INVITE_COPIED_TOAST = 'Invite link copied'`, `REVOKE_LABEL = 'Revoke'`, `MAKE_ADMIN_LABEL = 'Make admin'`, `MAKE_USER_LABEL = 'Make user'`; query keys `ADMIN_USERS_QUERY_KEY = ['admin', 'users']`, `INVITES_QUERY_KEY = ['admin', 'invites']`.

- [ ] **Step 1: Write the failing tests**

`admin-page.test.tsx` (fetch mock answering `/api/me` with an admin, `/api/admin/users`, `/api/admin/invites`, POST invites → 201 `{ id, url, expiresAt }`, DELETE → 204, POST role → 200; `vi.spyOn(navigator.clipboard, 'writeText')` as in `share-dialog.test.tsx`):

- "lists users with their role and hides the role toggle on the signed-in admin"
- "generate invite posts, copies the URL, shows the toast and refetches the list" (assert `writeText` called with the URL, `findByText(INVITE_COPIED_TOAST)`, and a second GET of invites)
- "revoke sends DELETE and refetches"
- "make admin posts the role and refetches users"
- "times render through formatTimestamp" (assert `formatTimestamp(expiresAt)` text is present; the fixture uses `Date.UTC(2026, 9, 24, 12, 0)` and the test runs under the vitest `TZ` already configured for web tests, or sets `process.env.TZ` is not possible in jsdom: compare against `formatTimestamp` output, not a literal)

`require-admin.test.tsx`: "a user is sent to documents with the Admins-only toast", "signed out goes to sign-in with next", "an admin renders the children".

`documents-page.test.tsx`, add: "the header shows the Admin link only for admins".

- [ ] **Step 2: Run the tests to verify they fail** — modules missing.

- [ ] **Step 3: Implement**

`admin-api.ts`: `fetchAdminUsers`, `fetchInvites`, `createInvite(): Promise<CreatedInvite>` (POST, expect 201), `revokeInvite(id)` (DELETE, expect 204), `setUserRole({ id, role })` (POST JSON), each throwing `ApiRequestError` on the wrong status, using `apiGet`/`apiSend`.

`use-admin-users.ts`, `use-invites.ts`: queries. Mutations live in the table components with `useMutation` + `queryClient.invalidateQueries` on success (the `new-document-button.tsx` pattern): generate → `await navigator.clipboard.writeText(created.url); toast(INVITE_COPIED_TOAST); invalidate INVITES_QUERY_KEY`; revoke → invalidate invites; set role → invalidate users.

`users-table.tsx`: columns Name, Email, Role, Joined (`formatTimestamp(user.createdAt)`), Action (`MAKE_ADMIN_LABEL` / `MAKE_USER_LABEL` button, omitted for `user.id === session.user.id`).

`invites-table.tsx`: columns State, Created, Expires, Created by, Accepted by, Action (`REVOKE_LABEL` only for `InviteState.Pending`); "Generate invite" button above the table; empty state paragraph like `document-table.tsx`.

`admin-page.tsx`: the documents page header (name, Admin link is not shown here; `SignOutButton`), `<h2>Users</h2>` + table, `<h2>Invites</h2>` + table.

`require-admin.tsx`:

```tsx
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();
  useEffect(() => {
    if (user && user.role !== UserRole.Admin) toast(ADMINS_ONLY_TOAST);
  }, [user]);
  if (isLoading) return <SessionSkeleton />;
  if (!user) return <Navigate to={`${AppRoute.SignIn}?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (user.role !== UserRole.Admin) return <Navigate to={AppRoute.Documents} replace />;
  return children;
}
```

`router.tsx`: `{ path: AppRoute.Admin, element: <RequireAdmin><AdminPage /></RequireAdmin> }` next to the documents route. `documents-page.tsx` header: `{user?.role === UserRole.Admin && <Link to={AppRoute.Admin}>{ADMIN_LINK_LABEL}</Link>}` before `SignOutButton`. `render-with-providers.tsx`: render `<Toaster />` inside the providers so toasts are assertable.

- [ ] **Step 4: Run the tests and typecheck** — `pnpm --filter @superdoc-history/web test:unit && pnpm typecheck` PASS.

- [ ] **Step 5: Commit** — `feat(web): admin page with users, invites and the role guard`.

---

### Task 9: E2E: fixtures, auth spec, admin spec (G4)

**Files:**
- Modify: `e2e/fixtures.ts`, `e2e/auth.spec.ts`
- Create: `e2e/admin.spec.ts`
- Modify: `playwright.config.ts` (nothing if the seed still runs first; verify `BUILD_AND_START_COMMAND` seeds, so the stack is claimed by `admin@example.com` with `DEMO_PASSWORD`)

**Interfaces:**
- Consumes: `DEMO_ADMIN`, `DEMO_PASSWORD`, `signUpPagePath`, the `/admin` copy constants (import from `@superdoc-history/types` only; copy strings are asserted by visible text, duplicated as constants at the top of the spec).
- Produces: fixtures `signedInAdmin({ browser })` (context signed in as `admin@example.com`), `generateInvite({ page }): Promise<string>` (clicks Generate invite, reads the clipboard through `page.evaluate(() => navigator.clipboard.readText())` with the `clipboard-read` permission granted on the context), `acceptInvite({ browser, url, name, email })`.

- [ ] **Step 1: Write the failing specs**

`e2e/auth.spec.ts`: replace "a new user signs up and lands on documents" with:

```ts
test('sign-up without an invite is refused once the instance is claimed', async ({ page }) => {
  await page.goto(AppRoute.SignUp);
  await expect(page.getByText(INVITE_INVALID_MESSAGE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up' })).toHaveCount(0);
});
```

`e2e/admin.spec.ts`:

```ts
test('an admin invites a user who joins and sees the admin link only on the admin side', async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  await expect(admin.page.getByRole('cell', { name: 'pending' })).toBeVisible();
  const invited = await acceptInvite({ browser, url, name: 'Eve', email: `eve-${Date.now()}@example.com` });
  await expectSignedInAs({ page: invited.page, name: 'Eve' });
  await expect(invited.page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await admin.page.reload();
  await expect(admin.page.getByRole('cell', { name: 'accepted' })).toBeVisible();
  await expect(admin.page.getByRole('row', { name: /Eve/ })).toBeVisible();
});

test('an invite link cannot be used twice', async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  await acceptInvite({ browser, url, name: 'One', email: `one-${Date.now()}@example.com` });
  const second = await browser.newContext();
  const page = await second.newPage();
  await page.goto(url);
  await expect(page.getByText(INVITE_INVALID_MESSAGE)).toBeVisible();
});

test('a revoked invite shows the invalid message', async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  await admin.page.getByRole('button', { name: 'Revoke' }).first().click();
  await expect(admin.page.getByRole('cell', { name: 'revoked' })).toBeVisible();
  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  await expect(page.getByText(INVITE_INVALID_MESSAGE)).toBeVisible();
});

test('a user opening /admin is sent to documents with the admins-only toast', async ({ browser }) => {
  const user = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await user.page.goto(AppRoute.Admin);
  await expect(user.page).toHaveURL(/\/documents$/);
  await expect(user.page.getByText('Admins only')).toBeVisible();
});
```

- [ ] **Step 2: Run the specs to verify they fail** — `pnpm test:e2e -- e2e/admin.spec.ts e2e/auth.spec.ts`: FAIL (no `/admin`, sign-up still open) when run against the pre-Task-4 build; against the current branch they must PASS, which is Step 4.

- [ ] **Step 3: Fixtures** as in Interfaces; the clipboard read needs `browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })` in `signedInAdmin`.

- [ ] **Step 4: Run the whole E2E suite** — `pnpm test:e2e`: PASS (every existing spec signs in with seeded users, which still exist).

- [ ] **Step 5: Commit** — `test(e2e): invite-only sign-up and the admin page`.

---

### Task 10: Delivery: compose files, env example, CI smoke, runbooks, README with the agent prompt (G4)

**Files:**
- Modify: `deploy/docker-compose.yml`, `docker-compose.yml`, `.env.example`, `.github/workflows/verify.yml`, `docs/features/deploy/runbook-railway.md`, `docs/features/deploy/runbook.md`, `README.md`
- Modify: `apps/server/src/repository-shape/compose.test.ts`, `entrypoint.test.ts`, `delivery-docs.test.ts` (G2 files; developer-4 edits them and says so)

- [ ] **Step 1: Write the failing repository-shape tests**

In `compose.test.ts`: `REQUIRED_VARIABLES` no longer contains `SEED_DEMO_USERS`; add "the production compose file sets SEED_DEMO_USERS to false and never reads DEMO_PASSWORD". In `delivery-docs.test.ts`: "the README's Configuration table lists every variable the compose file reads" and "the README's agent prompt names every required variable and ends with the claim step" (assert the fenced block under `## Install with an agent` contains `AUTH_SECRET`, `APP_ORIGIN`, `SEED_DEMO_USERS=false`, and the sentence `claim the instance`).

- [ ] **Step 2: Run them** — FAIL on the README.

- [ ] **Step 3: Implement**

- `deploy/docker-compose.yml`: `SEED_DEMO_USERS: "false"`, drop `DEMO_PASSWORD`. Root `docker-compose.yml`: keep `SEED_DEMO_USERS: ${SEED_DEMO_USERS:?}` (tests and local demos use it), and document it as test-only. `.env.example`: `SEED_DEMO_USERS=false`, `DEMO_PASSWORD` under a "Tests only" comment-free heading line (the file allows `#` notes; keep the existing style).
- `verify.yml` smoke: the sign-in step becomes claim then sign-in: `POST /api/auth/sign-up/email` with `{name:"Smoke",email:"smoke@example.com",password:"smoke-password-1234"}` expecting 200, then sign-in 200, then `GET /api/setup` → `{"claimed":true}`.
- `runbook-railway.md`: step 3 drops `SEED_DEMO_USERS=true` and `DEMO_PASSWORD` (sets `SEED_DEMO_USERS=false`); a new step "6. Claim the instance" (open the URL, "Claim this instance", create the admin account; then `/admin`, Generate invite, send the link) and "Hand it over" sends the URL plus invite links, never a shared password. `runbook.md` (Dokploy, historical) gets a one-line note at the top that the seed is test-only since ADR 0020.
- `README.md`: full rewrite in the spec's order. The agent prompt block:

````markdown
## Install with an agent

Paste this into Claude Code, Codex or any agent with a shell. It installs the app and stops where only you can continue.

```text
Install https://github.com/dhyegocalota/superdoc-take-home for me.

1. Clone the repository and read README.md and docs/features/deploy/runbook-railway.md.
2. Ask me one question: Railway (hosted, ~US$5/month) or Docker Compose on this machine. Do not continue until I answer.
3. Generate AUTH_SECRET with `openssl rand -base64 48`. Set the environment the runbook lists: PORT=3000, DATABASE_DIR=/data, WEB_DIST_DIR=/app/web, TRUST_PROXY=true (Railway) or false (local), APP_ORIGIN=<the public URL>, SEED_DEMO_USERS=false, and, if I give you an OpenRouter key, OPENROUTER_API_KEY and LLM_MODEL. Never print a secret.
4. Railway: follow the runbook steps 1 to 5 with the Railway CLI (I will run `railway login` when you ask). Docker: `docker compose up --build -d` with the variables above.
5. Verify: GET /api/health answers 200 and GET /api/setup answers {"claimed":false}.
6. Print the URL and stop. Tell me to open it and claim the instance: the first account created becomes the administrator, and sign-up closes behind it. Then tell me that /admin generates single-use invite links for my team.
```
````

- [ ] **Step 4: Run the repository-shape tests, format and typecheck** — PASS.

- [ ] **Step 5: Commit** — `docs: newcomer README with an agent install prompt; production seeds nothing`.

---

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 migration | drizzle-kit emits a `DROP`/recreate of `user` instead of `ALTER` | the SQL file contains `__new_user` | hand-write `0004` as five `ALTER TABLE ... ADD` plus `CREATE TABLE invites`, update the snapshot with `drizzle-kit generate --custom` |
| 2 plugin | `session.user.role` is undefined at runtime | `readSession` throws `Session user has no role.` in `session.test.ts` | check the plugin is in `plugins`, the column default applied, and the migration ran |
| 4 hooks | `normalizeCredentials`' returned context is lost by `sequence` | `sign-in` tests fail with `Invalid input.` on valid bodies | fix `sequence` to return the last defined value; test both orders |
| 4 after hook | Better Auth runs `after` before the user row is visible to Drizzle | `promoteEarliestUser` finds no row | move the promotion into `databaseHooks.user.create.after` instead |
| 4 test server | existing suites fail because `signInAndGetCookie` now needs an admin | 403 across `documents` tests | `startTestServer` claims by default; check `hasAdmin` |
| 5 CSRF | admin POSTs answer 403 from `csrf` in tests | every admin mutation test fails with 403 and no `error` body | send `origin: server.baseUrl` from the test helper |
| 8 toast | `findByText(INVITE_COPIED_TOAST)` never resolves | the Toaster is not mounted in `renderWithProviders` | mount it there |
| 9 clipboard | `readText` is denied in headless Chromium | the admin spec times out on `generateInvite` | grant `clipboard-read` on the context, or read the URL from the table's pending row title |
| 10 CI | the smoke step signs in as Ana | `verify.yml` sign-in 403 | claim with a smoke user first |

**Steps with no backout:** migration `0004` on a live database (Railway volume): additive columns and a new table only; a rollback deploy keeps working on the migrated schema because every added column has a default or is nullable.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded (sign-up claim, invited sign-up, admin page).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
- [ ] **Deploy:** merge, `railway up`, migration applies on the volume, the deployed instance already has users (Ana and Bruno from the walk): promote the owner with `railway run pnpm admin:promote <email>` or reset the volume and claim fresh (owner's call).
