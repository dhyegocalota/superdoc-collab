# Test plan: Scenario runs

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/repository-shape/scenario-stack.test.ts::the stack environment carries the keys the E2E config sets` — input: `stackEnvironment({ port: 3200, databaseDir: '/tmp/x', fakeOpenRouterOrigin: 'http://127.0.0.1:3299' })`; expected: keys `PORT, APP_ORIGIN, AUTH_SECRET, DATABASE_DIR, TRUST_PROXY, DEMO_PASSWORD, WEB_DIST_DIR, LLM_MODEL, OPENROUTER_API_KEY, OPENROUTER_BASE_URL, LLM_MAX_CONCURRENT_JOBS, LLM_MAX_CALLS_PER_HOUR`, `PORT` = `3200`, `APP_ORIGIN` = `http://127.0.0.1:3200`, `OPENROUTER_BASE_URL` = `http://127.0.0.1:3299/api/v1` — evidence: green on the branch (`npx vitest run` of the two shape files at 99f7a7b: 6 passed, exit 0); red at a854b36 with `stackEnvironment is not implemented`
- [x] `apps/server/src/repository-shape/scenarios.test.ts::a scenario never needs more authors than there are Playwright servers` — input: `.mcp.json` with one `playwright*` server, `core-realtime` with `authors: 2`; expected at the red commit: `expected [ 'core-realtime' ] to deeply equal []` — evidence: red worktree at a854b36 (`/private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/red.log`): the authors test printed `AssertionError: expected [ 'core-realtime' ] to deeply equal []` (4 failed, 2 passed); green at c015de4 (`npx vitest run` of the two shape files, 7 passed, exit 0)
- [x] Confirmed each fails for the right reason: the first prints `Error: stackEnvironment is not implemented` from the stub committed with the test, so the run reaches the named assertion; the second prints `expected [ 'core-realtime' ] to deeply equal []` — evidence: same red run at a854b36: the first test printed `Error: stackEnvironment is not implemented` from `e2e/stack.ts:2:9` through the named assertion; the authors test printed `expected [ 'core-realtime' ] to deeply equal []`; the config and `package.json` tests also failed with `expected ... to contain 'from \'./e2e/stack\''` and `expected undefined to be 'node e2e/scenario-stack.ts'`

## Unit

- [x] pin: `scenarios.test.ts::every scenario has the front matter, at least one test with one Expect and an index row` — green at the red commit a854b36 because the scenario file and the index were committed with the docs; expected: no violations — evidence: `scenarios.test.ts > every scenario has the front matter…` passed at c015de4 (vitest verbose, 7 passed, exit 0) and at a854b36 (2 passed there, it is a pin)
- [x] `scenario-stack.test.ts::playwright.config.ts boots through the shared stack module` — input: the config source; expected: contains `from './e2e/stack'` and no inline `BUILD_AND_START_COMMAND` — evidence: passed at 99f7a7b (vitest verbose); failed at a854b36 with the missing-import assertion
- [x] `scenario-stack.test.ts::the scenario stack script is reachable through pnpm` — input: `package.json`; expected: `scripts["scenario:stack"]` is `tsx e2e/scenario-stack.ts` — evidence: passed at 99f7a7b; failed at a854b36 with `undefined`
- [x] `scenarios.test.ts::a scenario never needs more authors than there are Playwright servers` — input: `authors` vs `.mcp.json`; expected: 2 ≤ 2 — evidence: passed at 99f7a7b; failed at a854b36 (`['core-realtime']` overbooked)
- [x] Edge: a scenario file with a test that has no `Expect:` line and `authors: two` — input: a temporary `docs/scenarios/zz-probe.md`; expected: the violations read `zz-probe: ### T<n> <title> has 0 Expect lines`, `zz-probe: authors is not an integer` and `zz-probe: not in the index` (the message names the test heading since 9c9af43; delete the file after) — evidence: at c015de4 a temporary `docs/scenarios/zz-probe.md` (`authors: two`, one `### T1 Probe without expectation`, no Expect) failed the test with `zz-probe: authors is not an integer`, `zz-probe: ### T1 Probe without expectation has 0 Expect lines`, `zz-probe: not in the index`; file deleted, `git status` shows only test-plan.md

## E2E (Playwright specs)

- [x] `pnpm test:e2e` after the extraction; expected: the same number of specs pass as on `main` (the config's behaviour is unchanged) — evidence: lead's run on this branch at 427db88, `39 passed (1.9m)`, log `/private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/tasks/bne5d4gxw.output`; `main` has 39 `test(` declarations across its 7 spec files and the branch has 39; not re-run by the tester. Later commits 243fa2a (stack script) and 99f7a7b (one line in `playwright.config.ts`) came after that run. Also: `stackEnvironment({ port: 3100, … })` equals the twelve literals of `main`'s config, 12 keys, 0 differences (script in the session scratchpad); rerun at 00c859f after the review fixes: `39 passed (1.9m)`, log `/private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/tasks/bqbcu6l5x.output`; c015de4 touches no file the suite exercises

## Prove it for real — the stack and the skill

- [x] `pnpm scenario:stack` in the background; expected: `ORIGIN=http://127.0.0.1:3200`, `DATABASE_DIR=<path>` and `PID=<pid>` printed, `/api/health` answers 200, the fake model's `/health` answers 200 on 3299 — evidence: `ORIGIN=http://127.0.0.1:3200`, `DATABASE_DIR=/var/folders/rd/0dkdjbdd4ln9tzpln92r3pd00000gn/T/superdoc-collab-scenario-XybHYE`, `PID=70416`, health 200, fake 200; repeated on the later code: `PID=30643`, health 200, fake 200, listeners node 3299 and node 3200
- [x] A second `pnpm scenario:stack` while the first runs; expected: exits non-zero naming port 3200 or 3299 — evidence: exit 1 in 0 s, `Port 3200 is busy; stop the process that holds it before starting a scenario stack`, no build started (`scratchpad/second.log`)
- [x] SIGTERM to the stack; expected: both children gone, `/api/health` unreachable within 5 seconds — evidence: `kill -TERM 70416` then `/api/health` and fake `/health` answered 000 at once, no listener on 3200 or 3299, no scenario process left; again on the later code with `kill -TERM 30643`: unreachable after 0 s, script gone. SIGTERM mid-build on the later code (inner node of the tsx wrapper): the fake model, the pnpm and vite build and the shell all gone, ports free
- [x] `/scenario unknown-slug`; expected: refuses and lists `core-realtime` — evidence: the skill was invoked with `unknown-slug`; step 1 followed: `docs/scenarios/unknown-slug.md` does not exist, `ls docs/scenarios` lists `core-realtime.md` and `README.md`, no stack booted. The refusal is performed by the agent reading the skill, not by code
- [x] `/scenario core-realtime` from this session (author B through `playwright-isolated`); expected: every test T1–T10 reported PASS or FAIL with a screenshot path, edge cases hunted, the report at `.pr-media/scenario-core-realtime/report.md`, the stack stopped after — evidence: T1–T10 below, 37 screenshots in `.pr-media/scenario-core-realtime/`, seven edge cases, stack stopped with `kill -TERM 70416`. The harness refused the tester writing `report.md` as a file, so the report is in the tester's final message and not on disk
- [x] Console and network clean during the run on both authors, other than the expected 401 on sign-out — evidence: no product console error on either author; Bruno's four console errors are the tester's deliberate 404 authorization probe; every request 2xx except those four 404s and one request aborted by the tester's own navigation; no 401 was recorded on sign-out; `.pr-media/scenario-core-realtime/network-*.txt`
- [x] Desktop width for both authors; narrow width (375) for author B during T5 — evidence: both authors at the default desktop viewport throughout; Bruno at 375x812 during T5, no horizontal scroll (`scrollWidth` 375), Ana's edit received, `05b-narrow-bruno-375.png`

## Scenario results (copied from the report)

| Test | Result | Evidence |
|------|--------|----------|
| T1 | PASS | `01-t1-ana.png`, `01-t1-bruno.png`: identical two paragraphs, both members online |
| T2 | PASS | `02-t2-*.png`: Bruno had ` More money` at once; Ana's textarea focused |
| T3 | PASS (overlap not proven) | `03-t3-*.png`: converged, each insertion once; the two calls ran 1.4 s apart, real overlap tested in the edge cases |
| T4 | PASS | rerun on 00c859f: after **Regroup topics** bands `Budget` (Ana) and `Hiring` (Bruno and Ana); events attribute ` More money and tax` to Ana (`E22zEhFS…`) and ` A designer while offline` to Bruno (`d918j7md…`); `04-t4-ana-rerun.png`, `04-t4-bruno-rerun.png` (first run FAILED on the old scenario text: bands `Ana`/`Bruno`) |
| T5 | PASS | `05-t5-*.png`, `05b-narrow-bruno-375.png`: text, bands, Bruno member kept; Bruno's next keystroke reached Ana at once |
| T6 | PASS | `06-t6-*.png`: Ana saw nothing while Bruno was offline, converged on reconnect, events attribute ` while offline` to Bruno |
| T7 | PASS | rerun on 00c859f: Bruno signed out, signed in as Dani (not a member): `/api/me` Dani, role `reader`, `READER-TYPED` changed nothing, Ana's ` for readers` reached Dani in 28 ms of polling; Bruno signed back in, role `editor`; `07-t7-dani-rerun.png`, `07-t7-ana-rerun.png`, `07-t7-follow-dani-rerun.png` (first run FAILED on the old premise) |
| T8 | PASS | rerun on 00c859f: latest mark without ` while offline` is 223 (`?at=1792254770000`); both banners `data-sequence` 223, both texts `…More money and tax\|…A designer`; Escape returned both to the live text; `08-t8-*-rerun.png`, `08b-escape-*-rerun.png` |
| T9 | PASS | `09-t9-*.png`: converged, both deletions in the events, 115 − 71 = 44 = final length |
| T10 | PASS | `10-t10-*.png`: Ana got all 2000 characters at once, Hiring band 2066, health 200 in 1 ms |

## Edge cases found during execution

- [ ] Ana types a long string into a paragraph while Bruno selects all and deletes; expected: Ana's editor keeps working — observed: Ana's editor shows `The editor stopped working. Reload the page to continue.`, Bruno fine, both empty after reload; DEFECT, regression test requested from the developer — evidence: `edge-02-type-into-deleted-ana.png`
- [ ] Signed-out user opens `/share/<token>`, is sent to `/sign-in?next=%2Fshare%2F<token>` and signs in; expected: lands on the shared document — observed: lands on `/documents`; DEFECT, regression test requested (the only E2E for `next` covers `/documents`) — evidence: Playwright run in the walk, `edge-03-link-after-ana-signout-bruno.png` for the related link case
- [x] Ana and Bruno type overlapping for 3 s at different positions; expected: converge, nothing lost or duplicated — evidence: identical 2108-character texts; Bruno's characters scrambled by the known caret caveat in `.claude/rules/collaboration.md`, `edge-01-overlapping-typing-bruno.png`
- [x] Bruno's edit link reopened after Ana signed out; expected: opens the document — evidence: `edge-03-link-after-ana-signout-bruno.png`
- [x] Ana uploads a second document while Bruno keeps the first open; expected: Bruno unaffected and denied the second — evidence: Bruno 404 on document, events, timeline and share-links of the second; `edge-04-*.png`
- [x] Read link opened by a non-member (Dani in Bruno's browser); expected: reader role, typing changes nothing, live updates arrive — evidence: role `reader`, text unchanged, ` for readers` seen at once, `07b-read-link-nonmember-dani.png`, `07c-reader-follows-live-dani.png`
- [x] Scenario-file findings: T4 lacked the Regroup topics step, T7 assumed Bruno had no access, T8 "before T6" needed the one-version-per-minute rule; the developer corrected the scenario file after the run (T4 regroups first, T7 uses Dani on Bruno's server, T8 names the mark rule) — evidence: `04b-t4-regrouped-ana.png`, `08-t8-ana.png`

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [x] Claim 1: `playwright.config.ts` behaves exactly as before the extraction — attack: diff the env the E2E server receives before and after; result: **held** — evidence: reviewer: `stackEnvironment({ port: 3100, … })` equals the twelve literals on `origin/main` in values and key order, `BUILD_AND_START_COMMAND` identical; tester: 12 keys, 0 differences; E2E 39 passed at 427db88 and at 00c859f
- [x] Claim 2: two `--isolated` servers never share a session — attack: sign in as Ana on one, read `/api/me` on the other; result: **held** — evidence: tester hypothesis 4: `/api/me` on the second server is not Ana; Dani's reader walk in T7 ran on Bruno's server after his sign-out with no leak of Bruno's session
- [x] Claim 3: the stack script never leaves a child alive — attack: SIGTERM mid-build and after boot; result: **held**, with one named gap — evidence: reviewer: the printed PID owns two detached groups and a TERM during the build kills the whole shell group; tester: `kill -TERM 69085` → health 000, nothing on 3200/3299; gap recorded in ADR 0023: a force-killed or crashed script orphans both groups, and the loopback probe names the busy port on the next run
- [x] Claim 4 (first pass, refuted then fixed): a second `pnpm scenario:stack` refuses before building — attack: a fake model left over on 3299 alone; result: **refuted** against the listening probe (the fake model binds loopback only, macOS reported the port free), **held** since 9c9af43 with the connect probe — evidence: a running stack makes the second start exit 1 within a second

## Coverage honesty

What is not tested and why.

- `playwright-second` itself is not exercised in this session (loaded at the next session start); `playwright-isolated` with the same flags stands in, and the shape test pins the declaration.
- The `/open-pr` suggestion step is read by the agent, not executed by code; the shape test pins the `paths` front matter it reads.
