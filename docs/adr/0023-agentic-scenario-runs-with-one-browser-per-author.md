# 0023. Agentic scenario runs with one Playwright MCP server per author

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: `.agents/roles/tester.md` ("one browser context per author"), `@playwright/mcp` 0.0.83 (`browser_run_code_unsafe` receives only `page`; a persistent profile is shared by every tab), [ADR 0018](0018-fan-out-ci-and-prebuild-the-projection-worker.md), `.claude/rules/e2e.md`

## Context

Every feature is proven by its own test plan and `/check-ui` walks one flow. Nothing walks the product's core, real-time collaboration and history, with several authors in real browsers after a change that touches it, hunting edge cases the specs never listed. The tester role asks for one browser context per author, but Playwright MCP exposes one page in one profile: two tabs share cookies and are the same user, and `browser_run_code_unsafe` cannot hand a second context back as first-class tools.

The E2E suite already boots the whole stack (build, seed, fake model, server) on fixed ports and must never share a server with another run.

## Decision

1. Scenarios are files under `docs/scenarios/<slug>.md`: front matter with the paths they cover, a body with setup, numbered tests with one `Expect` each, and edge cases to hunt. The first one is `core-realtime`.
2. `/scenario <slug>` boots the stack the E2E way, from `e2e/stack.ts` shared with `playwright.config.ts`, on its own ports (3200 and 3299) with the fake model and a fresh database, so a run is deterministic, free and never collides with `pnpm test:e2e`.
3. Each author is driven through its own Playwright MCP server: `.mcp.json` and `.codex/config.toml` declare `playwright` and `playwright-second`, both `--isolated`, so every author has its own cookies and the full tool set (snapshot, click, type, console, network). A third author is one more server.
4. `/open-pr` suggests the scenarios whose paths the diff touches **before the merge**, never before the PR opens, and the owner decides whether to run them.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| One MCP server per author, `--isolated` (chosen) | every author is first-class; scales by one config line; sessions are truly separate | one more server declared; two browser processes during a run | — |
| One server, extra contexts through `browser_run_code_unsafe` | no config change | the second author is blind: no snapshot, no click, no console; context handles must be smuggled across calls through globals | author B would be driven by code, not by the agent's tools |
| The second author as a scripted Playwright process | already the tester's fallback when MCP is down | not a real browser walk; the agent cannot look at what B sees | it is the fallback, not the design |
| `pnpm dev` with the real model | closest to production | non-deterministic topic names, costs model calls, Vite dev breaks the SuperDoc worker (learning 2026-10-15) | the scenario tests collaboration and history, not model quality |
| Suggest the scenario before opening the PR | catches more before review | blocks the automated open-PR path on a long browser run | the owner ruled: before merge only |

## Consequences

- `e2e/stack.ts` is the one place that knows how to boot the app for tests; `playwright.config.ts` and `e2e/scenario-stack.ts` both import it.
- The `playwright` MCP server moves from a persistent profile to `--isolated`; `/check-ui` and the tester already sign in through the form, so nothing changes for them except that nothing persists between sessions.
- A scenario run writes screenshots and a report under the git-ignored `.pr-media/scenario-<slug>/`; defects become learnings or fix features, never inline fixes.
- A session started before `.mcp.json` changed does not have `playwright-second`; the skill says so and stops rather than falling back to two tabs of one browser.
- Known gap: Hono's `serve()` gets no hostname, so a scenario stack (like the E2E stack before it) listens on every interface with the public demo credentials for the length of the walk. Binding test stacks to 127.0.0.1 is a product change with its own fix feature.
  Amended 2026-10-17: closed by `docs/features/test-stacks-bind-loopback/`: the server reads an optional `HOST`, and `e2e/stack.ts` sets `127.0.0.1` for the E2E and scenario stacks; the container leaves `HOST` unset and keeps every interface.

## Evidence

- `@playwright/mcp` 0.0.83 source: `browser_run_code_unsafe` is invoked with `page` only; `--isolated` keeps the profile in memory, and the README states a persistent profile serves one client at a time.
- The first `/scenario core-realtime` run, recorded in `docs/features/scenario-runs/test-plan.md`.

## Revisit when

- A scenario needs three or more authors at once.
- Playwright MCP exposes several contexts as first-class tools in one server.
- Scenario runs become stable enough to run on a schedule rather than on suggestion.
