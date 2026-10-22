# Plan: AUTH_SECRET rotation

**Spec:** spec.md
**Tier:** 🔴
**Seam:** `loadEnvironment`, `ShareLinksRepository`, `createAuth`
**Assumptions (decided, owner can override):**
- Better-auth 1.7's `secrets` list with the old value as `secret` is enough for the JWT key; no re-encryption step.
- Sessions are not preserved.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/config/environment.ts`, `apps/server/src/documents/share-links.ts`, `apps/server/src/auth/auth.ts`, `apps/server/src/server.ts`, `apps/server/src/testing/test-server.ts`, their tests | lead |
| G2 | `docs/adr/0051-*`, `docs/adr/0017-*`, `.env.example`, `docs/features/deploy/runbook-railway.md`, this folder | lead |

## Steps

1. Red: environment, share link and AI app tests for a rotation with and without the previous secret.
2. Green: optional previous secret through the environment, share links and better-auth options.
3. Docs, PR, merge, then rotate in production with the runbook command and deploy.
