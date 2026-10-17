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
| 2026-10-16 | A SuperDoc version cannot be renamed into its own room; isolate it by endpoint | [2026-10-16-a-superdoc-version-cannot-be-renamed-into-its-own-room.md](2026-10-16-a-superdoc-version-cannot-be-renamed-into-its-own-room.md) | 2026-10-16 |
| 2026-10-16 | Version endpoints must not declare identities or awareness | [2026-10-16-version-endpoints-must-skip-awareness-declarations.md](2026-10-16-version-endpoints-must-skip-awareness-declarations.md) | 2026-10-16 |
| 2026-10-16 | An async upgrade handler leaves the raw socket with no 'error' listener | [2026-10-16-async-upgrade-handlers-drop-the-socket-error-listener.md](2026-10-16-async-upgrade-handlers-drop-the-socket-error-listener.md) | 2026-10-16 |

### history

| Date | Title | File | Last revisited |
|------|-------|------|----------------|
| 2026-10-15 | Replay takes about 900 ms at 10k updates and the performance budget fails once per full run | [2026-10-15-full-replay-grows-without-bound.md](2026-10-15-full-replay-grows-without-bound.md) | 2026-10-16 |
| 2026-10-15 | After a server crash, text typed by one author is attributed to whoever reconnected first | [2026-10-15-relayed-updates-misattribute-after-a-crash.md](2026-10-15-relayed-updates-misattribute-after-a-crash.md) | 2026-10-16 |
| 2026-10-16 | Shrinking the snapshot interval barely moves open-room latency | [2026-10-16-yjs-decode-not-sqlite-is-the-load-cost.md](2026-10-16-yjs-decode-not-sqlite-is-the-load-cost.md) | 2026-10-16 |
| 2026-10-16 | Keystroke-level events must be grouped into runs before any term search | [2026-10-16-keystroke-events-need-runs-before-search.md](2026-10-16-keystroke-events-need-runs-before-search.md) | 2026-10-16 |

### testing

| Date | Title | File | Last revisited |
|------|-------|------|----------------|
| 2026-10-15 | Keystrokes land on BODY and typed text is silently missing, only under concurrency | [2026-10-15-click-steals-editor-focus-under-load.md](2026-10-15-click-steals-editor-focus-under-load.md) | 2026-10-16 |

### tooling

| Date | Title | File | Last revisited |
|------|-------|------|----------------|
| 2026-10-15 | SuperDoc never becomes ready under `vite dev` and the worker fails to load | [2026-10-15-vite-dev-breaks-superdoc-worker.md](2026-10-15-vite-dev-breaks-superdoc-worker.md) | 2026-10-16 |
| 2026-10-16 | A red-first claim cannot be verified when test and code share a commit | [2026-10-16-commit-the-failing-test-first.md](2026-10-16-commit-the-failing-test-first.md) | 2026-10-16 |
| 2026-10-16 | A commit from one lane sweeps in files another lane staged | [2026-10-16-parallel-lanes-share-one-git-index.md](2026-10-16-parallel-lanes-share-one-git-index.md) | 2026-10-16 |
| 2026-10-16 | A worker_threads exception with no 'error' listener exits the server | [2026-10-16-worker-threads-need-an-error-listener.md](2026-10-16-worker-threads-need-an-error-listener.md) | 2026-10-16 |
| 2026-10-16 | A read-only connection alone lets the reader's editor diverge | [2026-10-16-superdoc-reader-needs-viewing-mode.md](2026-10-16-superdoc-reader-needs-viewing-mode.md) | 2026-10-16 |
| 2026-10-16 | History lags up to Hocuspocus maxDebounce under continuous typing | [2026-10-16-hocuspocus-maxdebounce-bounds-history-latency.md](2026-10-16-hocuspocus-maxdebounce-bounds-history-latency.md) | 2026-10-16 |
| 2026-10-16 | AI SDK 7 deprecates generateObject; structured output is generateText + Output.object | [2026-10-16-ai-sdk-7-replaces-generateobject-with-output-object.md](2026-10-16-ai-sdk-7-replaces-generateobject-with-output-object.md) | 2026-10-16 |
| 2026-10-16 | A red-first commit must fail on the named assertion, not on a missing module | [2026-10-16-a-red-first-commit-must-fail-on-the-named-assertion.md](2026-10-16-a-red-first-commit-must-fail-on-the-named-assertion.md) | 2026-10-16 |
