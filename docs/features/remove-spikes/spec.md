# Remove spikes

**Status:** Shipped 2026-10-17
**Tier:** 🟢
**Owner approval:** approved 2026-10-17
**ADRs:** [0025](../../adr/0025-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md), [0029](../../adr/0029-agent-edits-carry-a-human-or-agent-actor.md), [0030](../../adr/0030-the-local-gate-runs-what-the-diff-can-break.md)
**Not changing:** the product, the agentic history feature, the spike's findings

## Problem

`spikes/sdk-room-join/` reached `main` with PR #30: a standalone prototype with its own `package.json` and lockfile. The repository already removed the proof of concept on 2026-10-17 for the same reason: answers belong in ADRs and feature folders, prototype code does not. The owner asked to delete it.

## Change

- `spikes/sdk-room-join/RESULTS.md` becomes `docs/features/agentic-history-mcp/spike-sdk-room-join.md`, its screenshots move to `docs/features/agentic-history-mcp/media/`, and it names commit `c1ada06` for the code.
- `spikes/` is deleted; `.prettierignore` and the `AGENTS.md` layout drop it; HARNESS §1 says a spike's code is never committed.
- ADR 0025, ADR 0029, the SDK runtime-v2 learning and the agentic history spec link the moved file.

## Test list

- A repository-shape test fails while a `spikes/` or proof-of-concept folder exists at the root (red first).
- `delivery-docs.test.ts` keeps every moved link resolving.
- `pnpm verify` on the branch.
