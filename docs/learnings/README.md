# Learnings

Dated traps that cost time. Each one is stated as the symptom you will see again, with the cause, the move that avoids it, and anchors in code, tests or commits.

Format: `.claude/HARNESS.md` section 8. Write them with the `learning` skill.

## Promotion

A learning that recurs is promoted in the same change that taught it again: a fact to `.claude/rules/`, a process to `.claude/HARNESS.md`, a mechanical check to a hook, a repeatable procedure to a skill. Keep the learning and link to where it went.

Every learning touched by a change gets a `Revisited` line appended.

## Index

### collaboration

| Date | Title | File | Last revisited |
|------|-------|------|----------------|
| 2026-10-15 | A second test stack reuses the first server's hooks and port | [2026-10-15-hocuspocus-server-export-is-a-singleton.md](2026-10-15-hocuspocus-server-export-is-a-singleton.md) | 2026-10-16 |
| 2026-10-15 | Every awareness update appears to come from the first user who opened the room | [2026-10-15-awareness-hook-context-is-the-creator.md](2026-10-15-awareness-hook-context-is-the-creator.md) | 2026-10-16 |
| 2026-10-15 | Backspace at a paragraph start and Delete at a paragraph end do nothing in collaboration mode | [2026-10-15-keyboard-paragraph-merge-is-a-no-op-in-collab.md](2026-10-15-keyboard-paragraph-merge-is-a-no-op-in-collab.md) | 2026-10-16 |
| 2026-10-16 | A SuperDoc version cannot be renamed into its own room; isolate it by endpoint | [2026-10-16-a-superdoc-version-cannot-be-renamed-into-its-own-room.md](2026-10-16-a-superdoc-version-cannot-be-renamed-into-its-own-room.md) | 2026-10-17 |
| 2026-10-16 | Version endpoints must not declare identities or awareness | [2026-10-16-version-endpoints-must-skip-awareness-declarations.md](2026-10-16-version-endpoints-must-skip-awareness-declarations.md) | 2026-10-16 |
| 2026-10-16 | An async upgrade handler leaves the raw socket with no 'error' listener | [2026-10-16-async-upgrade-handlers-drop-the-socket-error-listener.md](2026-10-16-async-upgrade-handlers-drop-the-socket-error-listener.md) | 2026-10-17 |
| 2026-10-17 | The SDK opens a document with a `collaboration` block, no error is raised, and the room on the server stays empty | [2026-10-17-sdk-collaboration-is-silently-ignored-without-runtime-v2.md](2026-10-17-sdk-collaboration-is-silently-ignored-without-runtime-v2.md) | 2026-10-17 |
| 2026-10-17 | A tracked edit through a cached SDK session returns ok and nothing reaches the update log | [2026-10-17-a-reused-sdk-session-keeps-the-room-token-and-read-only-flag-from-open.md](2026-10-17-a-reused-sdk-session-keeps-the-room-token-and-read-only-flag-from-open.md) | 2026-10-17 |
| 2026-10-17 | A payload or rate cap placed in a Hocuspocus hook does not stop the memory growth, and a peer that ignores the close keeps its socket for 30 s | [2026-10-17-hocuspocus-message-hooks-run-after-the-frame-is-buffered.md](2026-10-17-hocuspocus-message-hooks-run-after-the-frame-is-buffered.md) | 2026-10-17 |
| 2026-10-17 | A cap sized as a small multiple of the upload limit refuses the creator's first sync of a text-dense file | [2026-10-17-a-text-dense-docx-becomes-a-first-frame-several-times-its-size.md](2026-10-17-a-text-dense-docx-becomes-a-first-frame-several-times-its-size.md) | 2026-10-17 |
| 2026-10-17 | An expired session leaves the editor reconnecting forever instead of showing failed | [2026-10-17-the-hocuspocus-provider-retries-a-destroyed-upgrade-forever.md](2026-10-17-the-hocuspocus-provider-retries-a-destroyed-upgrade-forever.md) | 2026-10-17 |
| 2026-10-17 | Typing in a half-created room stalls the server because each update reads the update log | [2026-10-17-a-write-fence-that-asks-the-server-on-every-update-replays-the-log.md](2026-10-17-a-write-fence-that-asks-the-server-on-every-update-replays-the-log.md) | 2026-10-17 |
| 2026-10-17 | One user thrashes the commit-scan cache and the log is rescanned from zero on every open | [2026-10-17-a-scan-cache-keyed-by-document-needs-a-bound-and-a-distinct-document-budget.md](2026-10-17-a-scan-cache-keyed-by-document-needs-a-bound-and-a-distinct-document-budget.md) | 2026-10-17 |
| 2026-10-17 | The same user opening a fresh document in two pages leaves duplicated or missing content | [2026-10-17-a-reservation-keyed-by-user-hands-the-same-attempt-to-two-pages.md](2026-10-17-a-reservation-keyed-by-user-hands-the-same-attempt-to-two-pages.md) | 2026-10-17 |
| 2026-10-17 | A hand-built collaboration socket in an E2E never authenticates on an uncommitted room, and its slow spec is skipped by default | [2026-10-17-an-e2e-that-opens-the-collaboration-socket-by-hand-needs-the-creator-ticket.md](2026-10-17-an-e2e-that-opens-the-collaboration-socket-by-hand-needs-the-creator-ticket.md) | 2026-10-17 |

### history

| Date | Title | File | Last revisited |
|------|-------|------|----------------|
| 2026-10-15 | Replay takes about 900 ms at 10k updates and the performance budget fails once per full run | [2026-10-15-full-replay-grows-without-bound.md](2026-10-15-full-replay-grows-without-bound.md) | 2026-10-16 |
| 2026-10-15 | After a server crash, text typed by one author is attributed to whoever reconnected first | [2026-10-15-relayed-updates-misattribute-after-a-crash.md](2026-10-15-relayed-updates-misattribute-after-a-crash.md) | 2026-10-16 |
| 2026-10-16 | Shrinking the snapshot interval barely moves open-room latency | [2026-10-16-yjs-decode-not-sqlite-is-the-load-cost.md](2026-10-16-yjs-decode-not-sqlite-is-the-load-cost.md) | 2026-10-16 |
| 2026-10-16 | Keystroke-level events must be grouped into runs before any term search | [2026-10-16-keystroke-events-need-runs-before-search.md](2026-10-16-keystroke-events-need-runs-before-search.md) | 2026-10-16 |
| 2026-10-17 | A spend budget must count only jobs that reach the model | [2026-10-17-count-only-real-model-calls-toward-a-budget.md](2026-10-17-count-only-real-model-calls-toward-a-budget.md) | 2026-10-17 |

### testing

| Date | Title | File | Last revisited |
|------|-------|------|----------------|
| 2026-10-15 | Keystrokes land on BODY and typed text is silently missing, only under concurrency | [2026-10-15-click-steals-editor-focus-under-load.md](2026-10-15-click-steals-editor-focus-under-load.md) | 2026-10-16 |
| 2026-10-17 | A spec that reads a call counter off the fake upstream passes alone and fails as soon as its file runs in parallel | [2026-10-17-a-process-wide-call-counter-breaks-parallel-specs.md](2026-10-17-a-process-wide-call-counter-breaks-parallel-specs.md) | 2026-10-17 |
| 2026-10-17 | Text typed keystroke by keystroke can land in two runs | [2026-10-17-text-typed-keystroke-by-keystroke-can-land-in-two-runs.md](2026-10-17-text-typed-keystroke-by-keystroke-can-land-in-two-runs.md) | 2026-10-17 |
| 2026-10-17 | `shouldAdvanceTime` lets real lag move the fake clock, so a timer test passes alone and fails under load | [2026-10-17-should-advance-time-lets-real-lag-move-the-fake-clock.md](2026-10-17-should-advance-time-lets-real-lag-move-the-fake-clock.md) | 2026-10-17 |

### tooling

| Date | Title | File | Last revisited |
|------|-------|------|----------------|
| 2026-10-15 | SuperDoc never becomes ready under `vite dev` and the worker fails to load | [2026-10-15-vite-dev-breaks-superdoc-worker.md](2026-10-15-vite-dev-breaks-superdoc-worker.md) | 2026-10-16 |
| 2026-10-16 | A red-first claim cannot be verified when test and code share a commit | [2026-10-16-commit-the-failing-test-first.md](2026-10-16-commit-the-failing-test-first.md) | 2026-10-16 |
| 2026-10-16 | A commit from one lane sweeps in files another lane staged | [2026-10-16-parallel-lanes-share-one-git-index.md](2026-10-16-parallel-lanes-share-one-git-index.md) | 2026-10-17 |
| 2026-10-16 | A worker_threads exception with no 'error' listener exits the server | [2026-10-16-worker-threads-need-an-error-listener.md](2026-10-16-worker-threads-need-an-error-listener.md) | 2026-10-17 |
| 2026-10-16 | A read-only connection alone lets the reader's editor diverge | [2026-10-16-superdoc-reader-needs-viewing-mode.md](2026-10-16-superdoc-reader-needs-viewing-mode.md) | 2026-10-17 |
| 2026-10-16 | History lags up to Hocuspocus maxDebounce under continuous typing | [2026-10-16-hocuspocus-maxdebounce-bounds-history-latency.md](2026-10-16-hocuspocus-maxdebounce-bounds-history-latency.md) | 2026-10-17 |
| 2026-10-16 | AI SDK 7 deprecates generateObject; structured output is generateText + Output.object | [2026-10-16-ai-sdk-7-replaces-generateobject-with-output-object.md](2026-10-16-ai-sdk-7-replaces-generateobject-with-output-object.md) | 2026-10-16 |
| 2026-10-17 | A repository folder named `deploy/` breaks `pnpm deploy` inside the image build | [2026-10-17-a-repo-folder-named-deploy-breaks-pnpm-deploy.md](2026-10-17-a-repo-folder-named-deploy-breaks-pnpm-deploy.md) | 2026-10-17 |
| 2026-10-16 | A red-first commit must fail on the named assertion, not on a missing module | [2026-10-16-a-red-first-commit-must-fail-on-the-named-assertion.md](2026-10-16-a-red-first-commit-must-fail-on-the-named-assertion.md) | 2026-10-17 |
| 2026-10-17 | A disabled button never shows its title, so the reason must be visible text | [2026-10-17-a-disabled-button-never-shows-its-title.md](2026-10-17-a-disabled-button-never-shows-its-title.md) | 2026-10-17 |
| 2026-10-17 | A keydown inside an iframe never reaches the parent document's listeners | [2026-10-17-keydown-inside-an-iframe-never-reaches-the-parent.md](2026-10-17-keydown-inside-an-iframe-never-reaches-the-parent.md) | 2026-10-17 |
| 2026-10-17 | SuperDoc sends usage telemetry to its vendor unless the config turns it off | [2026-10-17-superdoc-telemetry-is-on-by-default.md](2026-10-17-superdoc-telemetry-is-on-by-default.md) | 2026-10-17 |
| 2026-10-17 | A guard hook blocks a harmless command because the forbidden flag appears in quoted prose | [2026-10-17-a-guard-hook-matches-the-flag-inside-quoted-prose.md](2026-10-17-a-guard-hook-matches-the-flag-inside-quoted-prose.md) | 2026-10-17 |
| 2026-10-17 | `pnpm audit` reports a critical `better-auth` advisory while the app ships a patched version | [2026-10-17-pnpm-audit-is-red-because-a-dev-cli-pins-an-old-better-auth.md](2026-10-17-pnpm-audit-is-red-because-a-dev-cli-pins-an-old-better-auth.md) | — |
| 2026-10-17 | pnpm's changed-since filter selects nothing in a linked worktree | [2026-10-17-pnpm-changed-since-selects-nothing-in-a-linked-worktree.md](2026-10-17-pnpm-changed-since-selects-nothing-in-a-linked-worktree.md) | — |
| 2026-10-17 | A key handler that reads React state sees the previous keystroke | [2026-10-17-a-key-handler-that-reads-react-state-sees-the-previous-keystroke.md](2026-10-17-a-key-handler-that-reads-react-state-sees-the-previous-keystroke.md) | 2026-10-17 |
| 2026-10-17 | A Radix dialog without a trigger drops focus to body on close | [2026-10-17-a-radix-dialog-without-a-trigger-drops-focus-to-body.md](2026-10-17-a-radix-dialog-without-a-trigger-drops-focus-to-body.md) | 2026-10-17 |
| 2026-10-17 | GitHub Actions may create no run for a push or PR, and tight API polling trips the secondary rate limit | [2026-10-17-github-actions-may-create-no-run-and-tight-polling-trips-the-rate-limit.md](2026-10-17-github-actions-may-create-no-run-and-tight-polling-trips-the-rate-limit.md) | 2026-10-17 |
| 2026-10-17 | Focusing a new SuperDoc document before the first click crashes the first keystroke | [2026-10-17-focusing-a-new-superdoc-document-before-the-first-click-crashes-the-first-keystroke.md](2026-10-17-focusing-a-new-superdoc-document-before-the-first-click-crashes-the-first-keystroke.md) | 2026-10-17 |
| 2026-10-17 | A hook that parses `git status --porcelain` maps a path with a space to the wrong folder | [2026-10-17-git-status-porcelain-quotes-paths-with-spaces.md](2026-10-17-git-status-porcelain-quotes-paths-with-spaces.md) | 2026-10-17 |
| 2026-10-17 | Better Auth hooks cannot be composed by hand; add a plugin with matcher hooks | [2026-10-17-better-auth-hooks-cannot-be-composed-by-hand.md](2026-10-17-better-auth-hooks-cannot-be-composed-by-hand.md) | 2026-10-17 |
| 2026-10-17 | `Intl.supportedValuesOf('timeZone')` does not list `UTC` | [2026-10-17-intl-supported-time-zones-omit-utc.md](2026-10-17-intl-supported-time-zones-omit-utc.md) | 2026-10-17 |
| 2026-10-17 | A session-start hook runs whatever a repository file contains when bash compares it with -ge | [2026-10-17-a-session-start-hook-runs-whatever-a-repository-file-contains.md](2026-10-17-a-session-start-hook-runs-whatever-a-repository-file-contains.md) | 2026-10-17 |
| 2026-10-17 | A `pnpm <name>` step is green in under a second and prints nothing the script would print | [2026-10-17-a-script-named-like-a-pnpm-built-in-never-runs.md](2026-10-17-a-script-named-like-a-pnpm-built-in-never-runs.md) | 2026-10-17 |
