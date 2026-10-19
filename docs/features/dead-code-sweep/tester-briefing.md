# Tester briefing: Dead code sweep

## What changed

- Two dependencies left the manifests: `@better-fetch/fetch` in `apps/server` and `tsx` in `libs/history`. The lockfile lost six lines.
- 26 exports lost their `export` keyword in `apps/server`, `apps/web` and `e2e`, and 11 symbols were deleted (six unused UI primitives, one query key, two copy items, one copy label, one enum member). Each line is in [report.md](report.md).
- `apps/web/src/styles/globals.css` lost two Tailwind colour extensions that no class uses.
- 25 unit tests were deleted: two with the code they exercised, 23 by the second pruning pass in [../test-pruning/report.md](../test-pruning/report.md).
- No behaviour changed. No route, no copy the user sees, no class on a rendered element changed.

## How to run

```
pnpm typecheck
pnpm --filter ./libs/types test:unit
pnpm --filter ./libs/history test:unit
pnpm --filter @superdoc-collab/server test:unit
pnpm --filter @superdoc-collab/web test:unit
pnpm --filter @superdoc-collab/repository-shape test:unit
pnpm test:e2e
```

One at a time. Port 3100 and the fake model port must be free before the E2E run.

## Red today, green after

Nothing. This lane is a behaviour-preserving deletion, so no test was red first. Every test that stays was green before and after. The mutation checks of the second pass (ten, in the test-pruning report) are the substitute for red-first.

## Hypotheses for the tester

1. No page changes in light or dark theme. The two colour extensions removed (`text-paper-foreground`, `bg-active`) have no user in `apps/web/src` or `e2e`.
2. Dialogs, alert dialogs, cards, forms and tables render as before. Only components with no importer were removed.
3. The server and the Docker image start without `@better-fetch/fetch`, because `better-auth` ships its own copy.
4. `pnpm --filter @superdoc-collab/history generate` still works without `tsx`, because `drizzle-kit` does not need it.
5. A deleted test left no behaviour unguarded. Each category 5 deletion names its survivor and the mutation that turned the survivor red.

## Known gaps

- Two E2E specs in `summary-mobile.spec.ts` fail on this branch before and after the sweep: the locator `View version` matches the new `View version after this edit` button from the version-view-after-delete lane. They are not caused by a deletion here.
- `exit-confirmation.spec.ts::an online edit never asks before leaving` timed out waiting for the document while another lane stack shared the machine; it passed on a rerun alone.
- `@modelcontextprotocol/sdk` is imported by `e2e/agent.ts` but listed only for the server; left as is, because adding a manifest line is not a deletion.
- `tools/repository-shape/src/ci-workflow.test.ts` restates `verify.yml`; kept because the HARNESS asks for it. Owner call.
