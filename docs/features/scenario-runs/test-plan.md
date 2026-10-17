# Test plan: Scenario runs

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/repository-shape/scenario-stack.test.ts::the stack environment carries the keys the E2E config sets` — input: `stackEnvironment({ port: 3200, databaseDir: '/tmp/x', fakeOpenRouterOrigin: 'http://127.0.0.1:3299' })`; expected: keys `PORT, APP_ORIGIN, AUTH_SECRET, DATABASE_DIR, TRUST_PROXY, DEMO_PASSWORD, WEB_DIST_DIR, LLM_MODEL, OPENROUTER_API_KEY, OPENROUTER_BASE_URL, LLM_MAX_CONCURRENT_JOBS, LLM_MAX_CALLS_PER_HOUR`, `PORT` = `3200`, `APP_ORIGIN` = `http://127.0.0.1:3200`, `OPENROUTER_BASE_URL` = `http://127.0.0.1:3299/api/v1`
- [ ] `apps/server/src/repository-shape/scenarios.test.ts::every scenario has the front matter, at least one test with one Expect and an index row` — input: `docs/scenarios/`; expected: no violations
- [ ] Confirmed each fails for the right reason: the first with `Cannot find module '../../../../e2e/stack'` resolved into the named assertion through a stub that throws `stackEnvironment is not implemented`; the second with `docs/scenarios` listed but the README missing or the file missing

## Unit

- [ ] `scenario-stack.test.ts::playwright.config.ts boots through the shared stack module` — input: the config source; expected: contains `from './e2e/stack'` and no inline `BUILD_AND_START_COMMAND`
- [ ] `scenario-stack.test.ts::the scenario stack script is reachable through pnpm` — input: `package.json`; expected: `scripts["scenario:stack"]` runs `e2e/scenario-stack.ts`
- [ ] `scenarios.test.ts::a scenario never needs more authors than there are Playwright servers` — input: `authors` vs `.mcp.json`; expected: 2 ≤ 2
- [ ] Edge: a scenario file without an `Expect:` line — input: scratch copy; expected: the violation names the test heading (verify by a temporary file, run, delete)

## E2E (Playwright specs)

- [ ] `pnpm test:e2e` after the extraction; expected: the same number of specs pass as on `main` (the config's behaviour is unchanged)

## Prove it for real — the stack and the skill

- [ ] `pnpm scenario:stack` in the background; expected: `ORIGIN=http://127.0.0.1:3200` and `SEED_DOCX=<path>` printed, `/api/health` answers 200, the fake model's `/health` answers 200 on 3299
- [ ] A second `pnpm scenario:stack` while the first runs; expected: exits non-zero naming port 3200 or 3299
- [ ] SIGTERM to the stack; expected: both children gone, `/api/health` unreachable within 5 seconds
- [ ] `/scenario unknown-slug`; expected: refuses and lists `core-realtime`
- [ ] `/scenario core-realtime` from this session (author B through `playwright-isolated`); expected: every test T1–T10 reported PASS or FAIL with a screenshot path, edge cases hunted, the report at `.pr-media/scenario-core-realtime/report.md`, the stack stopped after
- [ ] Console and network clean during the run on both authors, other than the expected 401 on sign-out
- [ ] Desktop width for both authors; narrow width (375) for author B during T5

## Scenario results (copied from the report)

| Test | Result | Evidence |
|------|--------|----------|
| T1 | | |
| T2 | | |
| T3 | | |
| T4 | | |
| T5 | | |
| T6 | | |
| T7 | | |
| T8 | | |
| T9 | | |
| T10 | | |

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: `playwright.config.ts` behaves exactly as before the extraction — attack: diff the env the E2E server receives before and after; result: <refuted | held>
- [ ] Claim 2: two `--isolated` servers never share a session — attack: sign in as Ana on one, read `/api/me` on the other; result: <refuted | held>
- [ ] Claim 3: the stack script never leaves a child alive — attack: SIGTERM mid-build; result: <refuted | held>

## Coverage honesty

What is not tested and why.

- `playwright-second` itself is not exercised in this session (loaded at the next session start); `playwright-isolated` with the same flags stands in, and the shape test pins the declaration.
- The `/open-pr` suggestion step is read by the agent, not executed by code; the shape test pins the `paths` front matter it reads.
