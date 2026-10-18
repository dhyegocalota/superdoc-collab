# `pnpm test:e2e -- <file>` runs every spec and holds the E2E ports

- Date: 2026-10-17
- Inspired by: the connection-state tester's first E2E runs (`docs/features/connection-state/test-plan.md`, tooling row): a one-spec run started the whole suite and then failed with `EADDRINUSE 127.0.0.1:3199`
- Revisited: 2026-10-17 — still true; `.claude/rules/e2e.md` states the single-spec command

## Signal
Asking for one spec runs all of them, a `-g` filter changes nothing, and a second run on the machine stops at a port already in use.

## Cause
The script forwards a literal `--` to Playwright, which then ignores the file and the `-g` filter. Every started stack binds fixed ports (3100, 3199, 3150), so a second run collides with the first.

## Do
Run one spec with `pnpm exec playwright test <file> -g <name>`, and check the ports are free before starting.

## Anchor
`.claude/rules/e2e.md` → Runner, `package.json` (`test:e2e`), `playwright.config.ts`, `e2e/restartable-stack.ts`
