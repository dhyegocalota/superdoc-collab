# Tester briefing: web readability (lane C2)

## API layer: Tasks 2, 6, 7, 8, 9 and Task 1 Step 2

Branch `chore/refinement-readability-web-api`. It merges `chore/refinement-readability-web-structure` (Task 1 and the sibling's later tasks) before Task 8.

### What changed and where

- **Task 2.** `presentOrNull` in `libs/types/src/text.ts` accepts `null`. The web reads `presentOrNull`, `NON_NEGATIVE_INTEGER_PATTERN`, `cellVolume` and `byVolumeDescending` from the libraries in `use-timeline-search.ts`, `selection-summary.ts`, `timeline-tooltip.tsx` and `contributor-avatars.tsx`.
- **Task 1 Step 2.** `DocumentUnavailableError` and `requestFailedMessage` live in `apps/web/src/lib/api.ts`.
- **Task 6.** `readJson`, `assertOk` and `assertDocumentAvailable` in `lib/api.ts` replace every `!response.ok` throw except `openDocument`, `fetchDocumentFile` and `fetchVersion`. `fetchDocuments` moved into `documents-api.ts`. The two auth tests mock `@/lib/api` with `importOriginal`.
- **Task 7.** `documentQueryKey` and `DOCUMENT_FILE_QUERY_KEY` in `documents-api.ts` build every document key.
- **Task 8.** `pollWhileAvailable(intervalMs)` in `lib/api.ts` drives all six pollers: timeline, summaries, both bin-edits queries, members and the running selection summary.
- **Task 9.** `RetryLaterError` in `lib/api.ts` carries `retryAfterMs`. `TopicsRefreshTooSoonError` and `SummaryTooSoonError` extend it. `useResetAfterRetry` in `lib/use-reset-after-retry.ts` clears both mutations when the wait ends.

### How to run

```bash
pnpm format:check && pnpm typecheck
cd apps/web && npx vitest run
pnpm --filter @superdoc-history/types exec vitest run
```

### Red before, green after

| Test | Red commit | Green commit |
|------|-----------|--------------|
| `text.test.ts` "presentOrNull reads a missing search parameter as null" (typecheck) | fe93133 | d6fdb58 |
| `document-query-keys.test.ts` "a document key nests its segments under the documents key" | fdbfeca | 5b323e1 |
| `use-reset-after-retry.test.ts` and the two retry-after tests in `timeline-api.test.ts` | ab16839 | 3f032ff |
| `api.test.ts` readJson, assertOk and 404 tests | 172a332 | fd95348 |
| `api.test.ts` "polling continues at its interval until the document is gone" | 97386f6 | dcacac3 |

`document-query-keys.test.ts` "every document key keeps its value" and the invalidation-scope test were committed green first (c21f651) and stay green.

### Hypotheses for the tester

- Every query key has the same value as before, and a rename or delete does not refetch the DOCX file.
- Regrouping topics still refreshes the timeline, its bin edits, the topics and the summaries.
- Every poller stops after a 404 and otherwise keeps its interval: members every 5 s, the rest every 3 s, and the selection summary only while it is running.
- A too-soon topic refresh or summary shows its notice and clears it when the wait ends. The summary notice shows the wait rounded up to whole seconds.

### Known gaps and deviations

- **Visible text change.** `requestFailedMessage` ends with a period, as it already did for the timeline messages. Upload, accepting a share link, members, share links, rotate, rename, delete, the documents list and the session request now end with a period too. The upload dialog and the share landing page show that text. No test pins those strings.
- **Summary reset timing.** The summary cooldown used to reset after the wait rounded up to whole seconds. It now resets after the exact wait. This differs only for a fractional `Retry-After` header.
- The plan's check for `/ SECOND_MS` in `features/timeline` still matches `timeline-notices.tsx` (projection lag) and `timeline-panel.test.tsx`. Neither concerns retry waits.
