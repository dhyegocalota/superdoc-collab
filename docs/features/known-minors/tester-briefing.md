# Tester briefing: Known minors

Written by the developer after the fix. Nobody on the build side ran `test-plan.md`.

## What changed

- `apps/web/src/features/editor/superdoc-editor.tsx` — Escape inside `[contenteditable="true"]` focuses a hidden sentinel after the editor; a hidden hint precedes the editor.
- `apps/web/src/features/versions/version-view-page.tsx`, `editor/viewer-messages.ts`, `editor/version-frame.tsx`, `editor/document-page.tsx` — Escape in the frame posts `Exit`; the parent calls Back to live.
- `apps/web/src/features/timeline/use-time-travel.ts`, `filter-box.tsx` — Escape passes through empty fields; the filter box clears its draft on Escape.
- `apps/web/src/features/timeline/timeline-notices.tsx` — "Naming topics…" whenever topics are pending.
- `apps/server/src/history/timeline-service.ts`, `libs/types/src/timeline.ts`, `apps/web/src/features/timeline/selection-summary.ts` — `projection.cursor` on the timeline; the panel stamp uses it.
- `apps/server/src/insights/prompts.ts`, `selection-summaries-service.ts` — `authorsNamed` keeps a sent name when every comma part is returned.

## How to run

As in `docs/features/timeline-and-time-travel/test-plan.md`; `pnpm typecheck`, `pnpm test:unit`, `pnpm test:e2e`.

## Hypotheses to attack

1. Escape never steals focus from a SuperDoc toolbar menu or dialog (target outside the editing surface).
2. The `Exit` message from another origin or another frame is ignored.
3. An edit anywhere in the document re-reads the summary exactly once per poll, not on every poll.
4. "Ana" and "Silva, Ana" in the same document are both kept only when the model names both.

## Known gaps

- Shift+Tab from the sentinel re-enters the editor.
- The Playwright MCP walk could not run in the fixing session (servers failed to connect).
