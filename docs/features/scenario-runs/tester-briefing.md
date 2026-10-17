# Tester briefing: Scenario runs

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `e2e/stack.ts` — the build-and-start command, `localOrigin` and `stackEnvironment`, shared by `playwright.config.ts` (ports unchanged: 3100 and 3199) and the scenario stack.
- `e2e/scenario-stack.ts` — `pnpm scenario:stack` (through `tsx`, new root devDependency): refuses a busy 3200 or 3299 before starting anything, boots the fake model and the server in detached process groups on a fresh database, prints `ORIGIN=`, `DATABASE_DIR=` and `PID=`, kills both groups on SIGINT, SIGTERM or server exit.
- `.mcp.json` and `.codex/config.toml` — `playwright` and `playwright-second`, both `--isolated`.
- `.agents/skills/scenario/SKILL.md` — the `/scenario <slug>` procedure; `.agents/skills/open-pr/SKILL.md` — the merge-time suggestion from each scenario's `paths`.
- `docs/scenarios/README.md` and `docs/scenarios/core-realtime.md` — the first scenario: ten tests, two authors.
- `apps/server/src/repository-shape/scenario-stack.test.ts` and `scenarios.test.ts`.
- HARNESS §5, §7 step 9, §10 and the layout; `AGENTS.md` layout; `e2e/README.md` one sentence.

## How to run

```bash
pnpm install --frozen-lockfile
pnpm --filter @superdoc-collab/server test:unit      # includes the two new shape files
pnpm scenario:stack                                   # background; wait for ORIGIN=, DATABASE_DIR=, PID=
curl --silent --max-time 2 http://127.0.0.1:3200/api/health
kill -TERM <PID>
```

The E2E suite (`pnpm test:e2e`, ports 3100/3199) was run by the lead on this branch; its result is in the test plan. Do not start a second E2E run while one is running: the config refuses to reuse a server.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `scenario-stack.test.ts::the stack environment carries the keys the E2E config sets` | the stub threw `stackEnvironment is not implemented` | `e2e/stack.ts` builds the twelve keys |
| `scenario-stack.test.ts::playwright.config.ts boots through the shared stack module` | the config held the inline command | it imports `./e2e/stack` |
| `scenario-stack.test.ts::the scenario stack script is reachable through pnpm` | no script | `tsx e2e/scenario-stack.ts` |
| `scenarios.test.ts::a scenario never needs more authors than there are Playwright servers` | one `playwright*` server in `.mcp.json` | two |
| `scenarios.test.ts::…front matter…index row` (pin) | green at the red commit a854b36: the scenario file and the index were committed with the docs | keeps every future scenario well-formed and indexed |

Red commit: `a854b36`.

## Hypotheses to attack

1. Hypothesis: `playwright.config.ts` sends the E2E server exactly the environment it sent before. Break it by: diffing `stackEnvironment({ port: 3100, … })` against the twelve literals on `main`'s config.
2. Hypothesis: `kill -TERM <PID>` leaves nothing behind. Break it by: `pgrep -fl "fake-openrouter|dist/main.js|scenario-stack"` after the kill, and by sending SIGTERM while the build is still running (before `ORIGIN=` prints).
3. Hypothesis: a second `pnpm scenario:stack` refuses before building. Break it by: starting it while the first is up; it must exit within a second naming port 3200, with no `pnpm --filter` build started.
4. Hypothesis: the two isolated Playwright servers never share a session. Break it by: sign in as Ana on `playwright`, then on `playwright-second` open `<ORIGIN>/api/me` without signing in; it must not be Ana.
5. Hypothesis: the ten tests of `core-realtime` pass on the product as it is. Break it by: running them; a FAIL is a product defect to report, not a reason to edit the scenario.

## Known gaps

- `playwright-second` is not loaded in this session (`.mcp.json` loads at session start); author B uses the user-level `playwright-isolated` server, which runs the same `--isolated` flag. The skill's tool list names `playwright-second`.
- A scenario walk takes long; the stack build alone is about two minutes.
