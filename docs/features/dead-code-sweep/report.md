# Dead code sweep: report

Spec: [spec.md](spec.md). Analysis: `pnpm dlx knip` (default and `--production`, no configuration file kept), `tsc --noEmit --noUnusedLocals --noUnusedParameters` per package and for `e2e`, `rg` for every lead before it was touched. Strings were searched too: route names, copy keys, test ids, CSS classes and custom properties.

## Counts

Taken from the `vitest run` summary line, one package at a time. Before is the branch at the start of the lane, after is the last commit.

| Package | Test files before | Test files after | Tests before | Tests after | Deleted |
|---|---|---|---|---|---|
| libs/types | 9 | 9 | 64 | 64 | 0 |
| libs/history | 23 | 23 | 366 | 362 | 4 |
| apps/server | 82 (2 skipped) | 82 (2 skipped) | 899 passed, 2 skipped | 898 passed, 2 skipped | 1 |
| apps/web | 132 | 132 | 1089 | 1069 | 20 |
| tools/repository-shape | 11 | 11 | 129 | 129 | 0 |

The E2E suite is not counted per test; its result is below. `git diff --stat main...HEAD` is the line count of the sweep.

## Deletions by kind

| Kind | Count |
|---|---|
| Dependencies removed from a `package.json` | 2 |
| `export` keyword removed, symbol still used in its own file | 26 |
| Symbols and files deleted (components, functions, constants, enum member, query key) | 11 |
| Tailwind colour extensions deleted | 2 |
| Unused imports, locals and test helpers deleted (lines below) | 10 |
| Tests deleted by the first sweep (their subject was deleted) | 2 |
| Tests deleted by the second pruning pass | 23 |

## Deleted

`path::symbol | why it is dead`

### Dependencies

- apps/server/package.json::@better-fetch/fetch | no importer in the server, e2e or libs; `better-auth` carries its own copy
- libs/history/package.json::tsx | no script or import in `libs/history` runs it

### Export removed (the symbol stays, used in its own file only)

- apps/server/src/collaboration/collaboration-server.ts::AWARENESS_MALFORMED_LOG | no importer
- apps/server/src/collaboration/collaboration-server.ts::MalformedAwarenessError | no importer
- apps/server/src/collaboration/collaboration-server.ts::CollaborationSupersededError | no importer
- apps/server/src/collaboration/collaboration-server.ts::CollaborationSingleDocumentError | no importer
- apps/server/src/collaboration/version-rooms.ts::STOP_TIMEOUT_MS | no importer
- apps/server/src/insights/llm-client.ts::LLM_TIMEOUT_MESSAGE | no importer
- apps/server/src/testing/oauth-client.ts::approveConsent | no importer; the end-to-end copy is separate
- e2e/agent.ts::approveConsent | no importer
- e2e/agent.ts::exchangeCode | no importer
- e2e/editor.ts::readEventsPage | no importer
- e2e/fixtures.ts::ADMIN_EMAIL | no importer
- e2e/stack.ts::LOOPBACK_HOST | no importer; the server tests have their own
- e2e/timeline.ts::BRUNO_TEXT | no importer
- e2e/timeline.ts::DETACHED_VIEWER_TEXT | no importer
- e2e/timeline.ts::readAccountTimeZone | no importer
- apps/web/src/features/auth/auth-failure.ts::GENERIC_AUTH_FAILURE_MESSAGE | no importer
- apps/web/src/features/auth/setup-api.ts::InviteNotValidError | no importer
- apps/web/src/features/editor/superdoc-zoom.ts::FULL_ZOOM_PERCENT | no importer
- apps/web/src/features/timeline/use-streamgraph-interaction.ts::tooltipAnchorOf | no importer
- apps/web/src/components/ui/badge.tsx::badgeVariants | no importer
- apps/web/src/components/ui/button.tsx::buttonVariants | no importer
- apps/web/src/components/ui/form.tsx::useFormField | no importer
- apps/web/src/components/ui/alert-dialog.tsx::AlertDialogOverlay | no importer; used by the content component
- apps/web/src/components/ui/alert-dialog.tsx::AlertDialogPortal | no importer; used by the content component
- apps/web/src/components/ui/dialog.tsx::DialogOverlay | no importer; used by the content component
- apps/web/src/components/ui/dialog.tsx::DialogPortal | no importer; used by the content component

### Symbols deleted

- apps/web/src/components/ui/alert-dialog.tsx::AlertDialogAction | no importer, no caller
- apps/web/src/components/ui/alert-dialog.tsx::AlertDialogTrigger | no importer, no caller
- apps/web/src/components/ui/card.tsx::CardAction | no importer, no caller
- apps/web/src/components/ui/form.tsx::FormDescription | no importer, no caller
- apps/web/src/components/ui/table.tsx::TableFooter | no importer, no caller
- apps/web/src/components/ui/table.tsx::TableCaption | no importer, no caller
- apps/web/src/features/timeline/timeline-api.ts::topicsQueryKey | no caller; only a test asserted its shape (the topics route itself stays)
- apps/web/src/features/timeline/timeline-copy.ts::topicCountLabel | no caller; only its own test used it
- apps/web/src/features/timeline/timeline-copy.ts::SUMMARIES_UNAVAILABLE_MESSAGE | no reader; only the period rule listed it
- apps/web/src/features/connected-apps/connected-apps-copy.ts::BACK_TO_DOCUMENTS_LABEL | no reader since the back link was removed
- apps/web/src/features/editor/superdoc-zoom.ts::ZoomMode.Manual | no member user; the zoom is always fit-width

### Tailwind colour extensions

- apps/web/src/styles/globals.css::--color-paper-foreground | no `text-paper-foreground` class anywhere; `--paper-foreground` stays for the caret rule
- apps/web/src/styles/globals.css::--color-active | no `bg-active` class anywhere; `--active` stays for the SuperDoc variables

### Unused imports, locals and helpers

- apps/web/src/features/editor/superdoc-editor.tsx::ConnectionFailureReason import | no reference
- apps/web/src/features/timeline/timeline-api.ts::TopicStatus import | no reference
- apps/web/src/features/timeline/timeline-api.test.ts::STATUS, TopicStatus, TopicState | no reference
- apps/web/src/features/timeline/timeline-notices.test.tsx::SECOND_MS import | no reference
- apps/web/src/features/versions/print-page.test.tsx::lastPage | no caller
- apps/server/src/agent/agent-sessions-room.test.ts::roomId parameter of locateRoom | never read
- apps/server/src/insights/topics-service.test.ts::HttpStatus import | no reference
- e2e/auth.spec.ts::MINE_EMPTY_MESSAGE import | no reference
- e2e/timeline.spec.ts::TOPICS_UNAVAILABLE_MESSAGE, RETRY_TOPICS_LABEL imports | no reference
- apps/web/src/features/timeline/timeline-panel.test.tsx::FAILED_VIEW, LAG_MS, SMALL_LAG_MS, cleanup and three imports | left without a user by the pruned tests

## Kept

Listed by knip or by a search as unused, kept on purpose.

- apps/server/package.json::@better-auth/oauth-provider | peer dependency of `@better-auth/mcp`, which the server imports
- apps/server/package.json::auth | the CLI that regenerates the auth schema from `better-auth.config.ts` (ADR 0022)
- apps/server/better-auth.config.ts | read by that CLI, never imported
- libs/history/drizzle.history.config.ts, libs/history/drizzle.read-model.config.ts, libs/history/src/schema/history.ts, libs/history/src/schema/read-model.ts | the `generate` script of `libs/history` runs `drizzle-kit` on them
- .agents/skills/brainstorming/scripts, .agents/skills/systematic-debugging/condition-based-waiting-example.ts | skill assets a skill names
- e2e/agent.ts imports of `@modelcontextprotocol/sdk` | resolved through the server workspace; a manifest line there is a dependency change, not a deletion
- apps/web/src/features/about/about-copy.ts::APP_DESCRIPTION, AGPL_LICENSE_URL, SUPERDOC_URL | `index-html.test.ts` pins `index.html` against them
- Duplicate-export aliases in libs/types/src/constants.ts, about-copy.ts and timeline-fixtures.ts | each alias names a different role of the same value
- libs/types::DocumentResource.Topics | the route `topics/refresh` answers on it
- Every constant that knip `--production` lists but the file itself still reads | exported for a test that pins the limit; the test is the reason
- apps/web/src/components/ui/{tabs,toggle-group,tooltip,dropdown-menu,form}.tsx | each export left is used
- docs/scenarios and skills name no deleted symbol (searched for every name above)

## Second test-pruning pass

Appended to [the test-pruning report](../test-pruning/report.md) under "Second pass (dead-code-sweep)".

## Proof

- `pnpm typecheck`: clean for libs, apps, tools and e2e at the last code commit.
- Unit suites: see Counts. Every package green.
- `tsc --noEmit --noUnusedLocals --noUnusedParameters` for every package and `e2e`: no output.
- `pnpm verify --plan`: class product, gates doctor format secrets typecheck audit unit e2e docker.
- `pnpm test:e2e`, one run of the whole suite: 125 passed, 2 skipped, 3 failed.
  - `summary-mobile.spec.ts` "on a phone a tap keeps the selected header in view and a version needs View version" and "on desktop a tap travels at once" fail on a strict-mode locator clash: `getByRole('button', { name: 'View version' })` also matches `View version after this edit`, the label added by the version-view-after-delete lane (`VIEW_EDIT_VERSION_LABEL`, introduced by 7e8dacd5, which is an ancestor of this branch). The sweep touches neither the label nor the spec. They failed again on a second run alone. The spec needs `exact: true`, which is that lane's to fix.
  - `exit-confirmation.spec.ts` "an online edit never asks before leaving" waited 60 seconds on "Loading document" while another lane's stack ran on the machine. Rerun alone with `summary-mobile.spec.ts`: it passed (6 passed, 2 failed, both the summary-mobile ones above).
  - No deleted symbol was restored, because none of the three specs reaches a deleted symbol.
