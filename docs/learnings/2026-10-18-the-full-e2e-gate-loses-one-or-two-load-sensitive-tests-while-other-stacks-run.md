# The full E2E gate loses one or two load-sensitive tests per run while other stacks run on the machine

- Date: 2026-10-18
- Inspired by: eight `pnpm verify` runs of the connected-apps-content lane (a web-only diff) on 2026-10-18, each red on a different test
- Revisited: 2026-10-18 — still true: summary-mobile added chart helpers to `e2e/timeline.ts`; `waitForBands` and `readVersionText` are unchanged
- Revisited: 2026-10-18 — changed because the band starvation was not a queue: the job runner refuses a third concurrent insights job (topic naming and Summarize share the runner) as Busy, `TopicsService` marks that first computation failed and never retries it automatically (a Summarize click regroups a failed computation, the band wait makes no such click), so the band never appears. The E2E stack now allows 8 insights jobs, above the worker count; the production default stays 2.
- Revisited: 2026-10-18 — second cause named: the `ECONNRESET` on `page.request.get` was the server's default 5 s keep-alive timeout closing a socket the client reuses; the server now keeps idle connections for 65 s ([2026-10-18-the-node-default-keep-alive-closes-a-socket-playwright-is-reusing.md](2026-10-18-the-node-default-keep-alive-closes-a-socket-playwright-is-reusing.md))
- Revisited: 2026-10-18 — third cause named: in `e2e/timeline.spec.ts` the two band growths must fit inside the other author's typing script, and with the projection throttle an 8 s script is overrun on a slow machine, so `isTyping` read false; the script now types 200 characters (about 20 s)

## Signal

`pnpm verify` prints `verify: e2e failed` with 90 to 92 of 92 tests passed and one or two red, never the same set: `waitForBands` in `e2e/time-travel.spec.ts` and `e2e/timeline.spec.ts` ("Budget" band not visible within 60 s), `apiRequestContext.get: read ECONNRESET` on the version text route about 21 s into `the live editor keeps working while the viewer is open`, the up-to-date summary text in `e2e/final-visuals.spec.ts`, or the fake-model call counter in `e2e/selection-summary.spec.ts`. Every red test passes when run alone in about 25 s, and the diff under test touches none of them.

## Cause

The flock hook serializes playwright, vitest and tsc, but not the stacks and browsers that tester sub-agents keep alive on other ports, nor stacks left behind by an audit, nor an orphaned vitest worker from a finished session burning a core. With that load, the fake model's topic naming is refused as Busy by `LLM_MAX_CONCURRENT_JOBS = 2` when a third document starts its first naming while two run, and the server resets a reused keep-alive connection under pressure. The E2E suite itself runs with `50%` of the cores as workers (six on a 12-core machine).

## Do

The E2E stack allows eight insights jobs (`e2e/stack.ts`), so a refused first naming no longer starves a band wait; keep that cap above the worker count. Before a gate: check `lsof -iTCP:3200,3400,3500,3700 -sTCP:LISTEN` and `ps -eo pid,etime,pcpu,command | grep -E 'vitest|scenario-stack'`, stop what nobody uses, and wait for the active tester walks to end. Run the gate as `CI=1 pnpm verify` when the machine is still busy: nothing else reads `CI`, and `playwright.config.ts` drops to four workers. Rerun each red test alone as evidence, record the run numbers in the PR comment, and never merge before a run prints `verify exit 0`.

## Anchor

`scripts/verify.sh` (`gate_e2e`), `playwright.config.ts` (`LOCAL_WORKERS`, `CONTINUOUS_INTEGRATION_WORKERS`), `e2e/timeline.ts` (`waitForBands`, `readVersionText`), `e2e/stack.ts` (`LLM_MAX_CONCURRENT_JOBS`), `.agents/hooks/` (the heavy-command lock), the gate logs `ca-verify-1.log` to `ca-verify-8.log` of 2026-10-18.
