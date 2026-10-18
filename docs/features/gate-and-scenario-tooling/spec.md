# Gate and scenario tooling

**Status:** Approved
**Tier:** 🟢
**Lane:** tooling
**Owner approval:** approved 2026-10-18 (the lead's tooling lane after the gate flakes and the scenario walk that could not type)
**ADRs:** [0014](../../adr/0014-one-source-per-agent-surface.md), [0023](../../adr/0023-agentic-scenario-runs-with-one-browser-per-author.md), [0030](../../adr/0030-the-local-gate-runs-what-the-diff-can-break.md)
**Not changing:** any product code; the gate's classes and gates; the pinned `@playwright/mcp` version (0.0.83 is the latest release).

## Problem

Five frictions surfaced while running gates and scenario walks on 2026-10-18.

- A tester's untracked walk spec under `e2e/` fails the `format` gate.
- Page-level web tests (`time-travel.test.tsx`, `document-page.test.tsx`, `timeline-panel.test.tsx`) wait one second by default and time out under machine load ([learning](../../learnings/2026-10-18-a-page-level-test-waits-one-second-by-default-and-times-out-under-machine-load.md)).
- The secret-rules probe builds its two near-miss tokens with `openssl rand -hex`; some draws fall under gitleaks' entropy threshold and the gate flakes (seen twice).
- The scenario walk could not type into a New document: `browser_type` fills the blank editing textarea without a click, so no selection exists and SuperDoc rejects the first key ([learning](../../learnings/2026-10-18-an-mcp-fill-on-a-blank-superdoc-surface-is-rejected-because-no-selection-exists.md)).
- No E2E covers typing into a document created with New document.
- The `playwright` MCP server hung 1800 s on `browser_close` for two testers, with no spare to switch to.

## Change

- `.prettierignore`: `e2e/_*`; the test runner and the e2e type check skip `e2e/_*` too.
- `apps/web/src/testing/setup.ts`: `asyncUtilTimeout` of five seconds for every web test; no assertion is weakened.
- `.github/scripts/secret-rules-probe.sh`: two fixed high-entropy constants replace the random tokens; the three probe cases stay. The constant names avoid the words key, secret and token, because gitleaks' generic rule flags such an assignment in the script itself.
- `docs/scenarios/core-realtime.md` Setup and `.agents/skills/scenario/SKILL.md` step 3: after New document, wait for the editor surface, click the first paragraph, press End, then type with keyboard presses.
- `e2e/documents.spec.ts`: "a new document accepts typing after a click" (click, End, type one sentence, reload).
- `.mcp.json` and `.codex/config.toml`: a third identical server `playwright-third`; `.claude/agents/tester.md` and `recorder.md` allow its tools; the tester and recorder roles say to call `browser_close` before the first navigation on each server and to abandon a server whose call has not returned within a minute.

## Tests

- The probe script's own run, three times in a row.
- The E2E above, run once against the real app.
- `pnpm typecheck`.
