# `pnpm audit` reports a critical `better-auth` advisory while the app ships a patched version

- Date: 2026-10-17
- Inspired by: [ADR 0022](../adr/0022-mechanical-security-gates-and-a-security-reviewer.md), the first `pnpm audit` run for the security gate

## Signal

`pnpm audit --audit-level=high` exits 1 with fifteen advisories, a `critical` one on `better-auth`, while `apps/server/package.json` pins `better-auth` 1.7.10, well past every patched version the advisories name.

## Cause

Every high and critical path resolves through `apps/server > @better-auth/cli 1.4.21 > better-auth 1.4.21` (and `drizzle-orm 0.41.0`, `lodash` under the same tree). The CLI is a dev dependency used only to generate the auth schema, it is at its latest release, and it pins its own old `better-auth`. The production tree is clean: `pnpm audit --prod --audit-level=high` exits 0.

## Do

Gate production dependencies only (`pnpm security:audit` = `pnpm audit --prod --audit-level=high`). Read the advisory paths before bumping anything: a path through a dev-only tool is noise for the deploy and a reason to watch that tool's releases, not a reason to override its dependency. A production advisory with no fix goes into `pnpm.auditConfig.ignoreCves` with the reason in the commit body, never silently.

## Anchor

- `package.json` → `security:audit`
- `.github/workflows/verify.yml` → `security` job
- `apps/server/src/repository-shape/ci-workflow.test.ts` → `the security job audits production dependencies…`
