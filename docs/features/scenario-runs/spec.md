# Scenario runs

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-17 (decisions taken in chat: one scenario per core flow, E2E-style stack on its own ports with the fake model, one Playwright MCP server per author, suggestion before merge and never before open)
**ADRs:** [0023](../../adr/0023-agentic-scenario-runs-with-one-browser-per-author.md)
**Not changing:** the E2E suite and its ports; `/check-ui` and the `tester` role (they stay per feature); `playwright.config.ts` behaviour (it only imports the boot it already had); product code.

## Problem

Every feature is proven by its own test plan, and `/check-ui` walks one flow. Nothing walks the product's core, collaboration and history in real time with several authors, in a real browser, after a change that touches it, hunting edge cases the specs did not list. The tester role says "one browser context per author", but Playwright MCP exposes one page, so multi-author walks have fallen back to scripted specs.

## Goals

- `/scenario <slug>` boots the whole stack locally from a clean database, drives every author through its own Playwright MCP server, runs every test of the scenario, hunts edge cases, and reports pass/fail per test with evidence.
- Scenarios are files under `docs/scenarios/`, one per core flow, each with the paths it covers; adding a scenario is adding a file.
- Before a **merge**, `/open-pr` names the scenarios whose paths the diff touches and suggests running them; the owner decides. Nothing runs before the PR opens.
- The first scenario covers collaboration and history in real time with two authors.

## Non-goals

- A third Playwright MCP server; three-author scenarios are a one-line addition when needed.
- Replacing the E2E suite; scenarios are agentic, exploratory and slower.
- Running scenarios in CI.
- A real model: the fake OpenRouter answers topics and summaries deterministically.

## Design

### Data flow

```
/scenario <slug>
  ├─ read docs/scenarios/<slug>.md (front matter: name, authors, paths; body: setup, tests, edge cases)
  ├─ pnpm scenario:stack                      (background)
  │     e2e/scenario-stack.ts: build web + server, seed demo users into a temp DATABASE_DIR,
  │     start the fake model on 3299 and the server on 3200, write SEED_DOCX, print ORIGIN and SEED_DOCX
  ├─ wait for ORIGIN/api/health
  ├─ author A → mcp__playwright__*            author B → mcp__playwright-second__*
  │     sign in through the form, run every test, screenshot each Expect
  ├─ hunt the edge cases listed and any found; a bug → defect with repro, never a fix
  ├─ write .pr-media/scenario-<slug>/report.md (git-ignored) and the chat summary
  └─ stop the stack

/open-pr → Merge
  └─ for each docs/scenarios/*.md: paths ∩ git diff --name-only main...HEAD ≠ ∅ → suggest `/scenario <slug>`
```

### Interfaces

- `docs/scenarios/<slug>.md`: front matter `name`, `title`, `authors` (how many MCP servers the run needs), `paths` (globs, same shape as `.claude/rules/`); body with `## Setup`, `## Tests` (each `### Tn <title>` with steps and one `Expect:` line) and `## Edge cases to hunt during the run`. `docs/scenarios/README.md` indexes them.
- `e2e/stack.ts`: the boot shared by `playwright.config.ts` and the scenario stack: `BUILD_AND_START_COMMAND`, `stackEnvironment({ port, databaseDir, fakeOpenRouterOrigin })`, the fixed secrets and limits. `playwright.config.ts` imports it and keeps its ports.
- `e2e/scenario-stack.ts`: runs `node e2e/fake-openrouter.ts` and the build-and-start command with `stackEnvironment` on `SCENARIO_PORT` 3200 and `SCENARIO_FAKE_OPENROUTER_PORT` 3299, writes `seed.docx` with the scenario fixture paragraphs into the database directory, prints `ORIGIN=` and `SEED_DOCX=`, forwards SIGINT and SIGTERM to both children. `package.json`: `scenario:stack`.
- `.mcp.json` and `.codex/config.toml`: `playwright` and `playwright-second`, both `@playwright/mcp@latest --browser chromium --isolated`.
- `.agents/skills/scenario/SKILL.md`: argument `<slug>`; refuses an unknown slug by listing `docs/scenarios/`; boots, waits, runs tests in order, one author per server, screenshots to `.pr-media/scenario-<slug>/`, writes the report, stops the stack, reports pass/fail per test with the evidence paths, edge cases found and defects with reproduction steps. It never edits product code; a defect becomes a learning or a fix feature.
- `/open-pr` Merge section: step 0 lists the scenarios whose `paths` match the diff and suggests `/scenario <slug>` to the owner; when none matches it says so.
- Repository-shape test `scenarios.test.ts`: every `docs/scenarios/*.md` has the front matter keys, at least one test with an `Expect:` line, `authors` ≤ the number of Playwright servers declared in `.mcp.json`, and the README indexes it. `stack.test.ts` under `apps/server/src/repository-shape/`: `stackEnvironment` returns the same keys the E2E config used and `playwright.config.ts` imports `./e2e/stack`.
- HARNESS §5 (multi-author via one MCP server per author), §7 (merge step), §10 (skill row), `.agents/skills/README.md`, `e2e/README.md` (new files).

### Failure handling

- Port 3200 or 3299 busy → the stack script exits with the port in the message; the skill stops and names the process to stop.
- The build fails → the skill stops at the first error block; nothing is reported as run.
- A Playwright MCP server missing in the session (the tools are absent) → the skill stops and says which server to add to `.mcp.json`; it never falls back to two tabs of one browser, which would share the session.
- A test fails → the run continues to the next test (tests are independent after Setup) and the report lists every failure with the screenshot; a Setup failure stops the run.
- The stack is left running after a crash → the skill's last step always sends SIGTERM to the background job and checks `/api/health` answers nothing.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| How the stack boots | reuse the E2E boot with the fake model / `pnpm dev` with a real key / flag | reuse the E2E boot | 2026-10-17 |
| Multiple browsers | one MCP server per author / extra contexts via run_code / scripted author B | one MCP server per author | 2026-10-17 |
| When to suggest | before open / before merge | before merge only | 2026-10-17 |

## Test strategy summary

Shape tests for the scenario files and the shared stack module; `pnpm typecheck` covers `e2e/stack.ts` and `e2e/scenario-stack.ts`; the E2E suite still green proves the config refactor; the proof of the skill is one full `/scenario core-realtime` run with its report and screenshots, recorded in the test plan. In this session the second server is the user-level `playwright-isolated`; the test plan states it.
