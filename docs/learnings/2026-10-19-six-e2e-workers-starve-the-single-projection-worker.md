# Six E2E workers starve the single projection worker

- Date: 2026-10-19
- Inspired by: two consecutive full gates on `feat/word-like-shortcuts` (cabdfcd8, fc029c56) each failing one different load-sensitive spec (`room-admission.spec.ts:219`, `timeline.spec.ts:113`) that passed alone
- Revisited: 2026-10-19 — fixed in the same branch
- Revisited: 2026-10-19 — the large-commit wait in room-admission also needed 180 s when another stack builds during the gate

## Signal

A full `pnpm verify` run ends with `1 failed, 151 passed` in the E2E stage; the failing spec differs between runs, it waits on a projected band or a reopened room for its whole timeout, and it passes in under two minutes when run alone.

## Cause

Playwright ran half the machine's cores as workers (six on this machine) against one server with one projection worker thread. With 151 specs in flight the projection queue fell behind, and specs that poll the timeline for the next batch (a band growing while the other author types, a fresh document's first page after a reopen) outlived their 60 or 120 second waits.

## Do

Run the local suite with the same four workers as CI (`LOCAL_WORKERS = CONTINUOUS_INTEGRATION_WORKERS` in `playwright.config.ts`); the run takes about a minute longer and the projection worker keeps up. A spec that waits on projection output states its timeout in terms of the shared worker, never of its own document.

## Anchor

`playwright.config.ts` (`LOCAL_WORKERS`), `.claude/rules/e2e.md` → Runner, gate logs `.pr-media/gate/verify-cabdfcd8.log` and `verify-fc029c56.log`
