# Refinement: web readability (lane C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make `apps/web` read as one engineer's code without changing one observable behaviour.

**Architecture:** first one mechanical commit of moves and renames. Then adopt lane C1's library helpers and add the small timeline helpers. Then rebuild the web API layer bottom-up (`readJson`, `documentQueryKey`, `pollWhileAvailable`, `RetryLaterError`), then the two listener hooks. Then split `useTimeTravel` and `TimelinePanel` with their existing suites as the proof, and finish with `superdocOptions`, `ErrorMessage`, the auth card, two small conditionals and the `jsonResponse` test sweep.

**Tech Stack:** React 19, React Router 8, TanStack Query 5, react-hook-form + zod, SuperDoc 2.23.0, Vitest + Testing Library (jsdom), Playwright, Prettier (print width 140).

**Spec:** `spec.md` (same folder)

**Tier:** 🟡
**Branch:** `chore/refinement-readability-web`, cut from `main` after lane A (`refinement-ux-care`) and lane C1 (`refinement-readability-server`) are merged.
**Seam:** module boundaries inside `apps/web/src`, plus the parameter type of `presentOrNull` in `libs/types/src/text.ts`.
**Assumptions (decided, owner can override):**
- Paths and names are as lane A and lane C1 leave them. Lane A: `lib/app-copy.ts`, `lib/use-document-title.ts`, `components/ui/{skeleton,dropdown-menu}.tsx`, `features/editor/{home-link.tsx,superdoc-zoom.ts}` (`initialZoomMode`, `followViewportZoom`), `features/documents/{use-create-document.ts,new-document-state.ts}`, `OpeningDocument` inside `document-page.tsx`, `regroupDisabledReason` and `REGROUP_TOPICS_LABEL` in the panel, the editor header's `DocumentActionsMenu`, the auth pages reading `auth-copy.ts`, `renderWithProviders(…, { state })`, and a `matchMedia` double that answers `matches: false`. Lane C1: `secondsRoundedUp`, `NON_NEGATIVE_INTEGER_PATTERN`, `presentOrNull` from `@superdoc-history/types`; `cellVolume`, `byVolumeDescending` from `@superdoc-history/history/timeline`. If a name differs, follow the merged code and keep the behaviour below.
- Line numbers are deliberately absent because lane A and Prettier move them. Every step names the symbol.
- Where a step shows only the changed lines of a lane-A file, the rest of that file stays as lane A left it.
- A red test fails on its named assertion, not on an import error: each task lists the inert stub that is committed with it.

## Global Constraints

- No comments, no `else`, flat `if`s with early returns, no nested `if`.
- Never `?? defaultValue`. `?.` is fine.
- Enums over string literals; constants at the top of the file, in a `*-copy.ts` file or in `libs/types`.
- Function declarations for functions, components and hooks, typed. Named parameters whenever there is more than one parameter.
- No `.js` in imports, no acronyms in new identifiers, array methods over loops.
- Behaviour-preserving: request paths, methods and bodies, query key values, poll intervals, every user-visible string, every Tailwind class and the SuperDoc constructor options stay the same.
- No class-string assertions in new tests; assert roles, names, text, attributes and call arguments.
- Every task ends with these three, all green, then its commit:

```bash
pnpm format:check
pnpm typecheck
cd apps/web && npx vitest run
```

- Before every `git commit`: `pnpm exec prettier --write <the files about to be staged> && pnpm format:check`. Prettier owns the layout (print width 140); the plan's snippets are a guide to content, not to line breaks.
- New helper: commit the red test with its inert stub (`test(web): …`), then the implementation (`refactor(web): …`). Pinning test: commit it green on its own before the change it pins. Pure moves and renames: one `refactor(web): …` commit.
- Never `git add -A`, `git add .` or `--no-verify`; stage the files the task names. Commit bodies end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Query invalidation keys.** Every builder must return exactly today's array. Regrouping topics must invalidate the timeline and its bin edits, the topics and the summaries. A rename or a delete invalidates `['documents']`, which must not match the DOCX file query, or the blob is downloaded again on every rename. *Pinned in Task 7 by `document-query-keys.test.ts` (values and invalidation scope), plus `timeline-panel.test.tsx` "Retry posts the refresh once and loads the timeline again" and "refreshing the topics reads the summary again".*
2. **Poll stop on 404.** All six pollers stop on `DocumentUnavailableError` and keep their own interval: members every `MEMBERS_REFRESH_MS`, the rest every `TIMELINE_POLL_MS`, and the selection summary only while it is running. *Pinned in Task 8 by `api.test.ts` "polling continues at its interval until the document is gone", plus `use-selection-summary.test.ts` "a document that is gone stops the polling", `time-travel.test.tsx` "a document that disappears while viewing stops every poll" and `document-page.test.tsx` "a members 404 … stops polling".*
3. **Escape handling order.** The time-travel and frame listeners stay on `document` in the bubble phase. They ignore an Escape whose default was prevented, and the time-travel one also ignores Escape while typing in a non-empty field. A band's own Escape (`stopPropagation`) leaves the version exactly once. *Pinned in Task 10 by `use-escape-key.test.ts` (disabled, other key, prevented, stopped below the document), plus the five Escape tests in `time-travel.test.tsx` and "Escape inside the frame asks the parent to leave the version".*
4. **The version pin effect.** Going live clears the pin and the shown version. A period with a version pins it once and keeps it while a poll reports a newer one. A bin without a version hides the shown version and keeps waiting. A timeline that arrives after the URL resolves once. *Pinned in Task 11 by `bin-containing.test.ts` and by `time-travel.test.tsx` "a poll that reports a newer version for the viewed period does not move the viewer", "moving to another period resolves its version again", "an at set before the timeline arrives resolves its version once when it does" and "a moment without a version yet shows progress up to the end of its period".*
5. **Sign-in error display.** A 401 shows only `AUTH_ERROR_MESSAGE`. A 429 shows the seconds read from `X-Retry-After` once that constant is renamed. Any other failure shows the generic message, as an alert, inside the new `AuthCard`. *Pinned in Task 1 by the 429 test committed before the rename, and in Task 15 by `auth-card.test.tsx` "a root error is announced as an alert" plus the unchanged `sign-in-page.test.tsx`.*

---

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/**`, `libs/types/src/{text,text.test}.ts` | `developer-c2` (one developer, tasks in order) |

## Sequencing

One developer runs the tasks in order on one branch. `timeline-api.ts`, `timeline-panel.tsx`, `use-time-travel.ts`, `document-page.tsx` and `lib/api.ts` are touched by several tasks, so parallel groups would collide on the same lines.

- Task 1 is first: later code is written with the final names and in the final files.
- Tasks 2 to 5 are small timeline helpers. Tasks 6 to 9 build the API layer bottom-up, because `pollWhileAvailable` and `RetryLaterError` live next to `readJson`. Task 10 adds the listener hooks.
- Task 11 needs Tasks 1, 8 and 10. Task 12 needs Task 11 (`binContaining`). Task 13 stands alone. Tasks 15 and 16 need Task 14 (`ErrorMessage`).
- Task 17 runs last, because it edits the proof suites and must not run before the splits are proven against them unchanged. Task 18 is the lane gate.

A rebase conflict after a late lane-A fix stays inside one task: redo that task's steps on the new base rather than merging hunks, because each task is one or two commits.

## Steps

Author this list with every box empty. A sub-agent ticks its own line. A wrong step is struck through with the reason, not deleted.

### Task 1: Mechanical moves and renames

Covers 1.6, 1.14, 1.15, 1.16, 1.19, 1.20, 2.12, the `ResizeHandle` half of 2.3, 3.5, the move half of 4.21, 5.7 and 5.8.

**Files:**
- Test: `apps/web/src/features/auth/sign-in-page.test.tsx` (one pinning test)
- Create: `apps/web/src/features/editor/{use-document-file.ts,use-members.ts,unavailable-notice.tsx,opening-document.tsx}`, `apps/web/src/features/timeline/{resize-handle.tsx,use-bin-runs.ts}`
- Modify: `apps/web/src/lib/{api.ts,keyboard.ts}`, `apps/web/src/features/auth/{auth-failure.ts,use-auth-submit.ts}`, `apps/web/src/features/editor/{document-page.tsx,editor-api.ts}`, `apps/web/src/features/timeline/{timeline-panel.tsx,timeline-copy.ts,timeline-api.ts,use-time-travel.ts,use-selection-summary.ts}`, `apps/web/src/features/versions/{version-banner.tsx,version-frame.tsx,version-view-page.tsx,use-run-highlights.ts}`
- Modify (imports only): `apps/web/src/features/timeline/timeline-api.test.ts`, `apps/web/src/features/versions/version-view-page.test.tsx`

**Interfaces:**
- Consumes: lane A's `document-page.tsx` (`OpeningDocument`, `useDocumentTitle`, `useLocation`), lane A's panel (`regroupDisabledReason`).
- Produces:
  - `DocumentUnavailableError`, `requestFailedMessage({ subject, status }: { subject: string; status: number }): string` from `@/lib/api`.
  - `isTypingInField(target: EventTarget | null): boolean` from `@/lib/keyboard`.
  - `useDocumentFile({ documentId, roomMode })`, `useMembers(documentId)`, `UnavailableNotice({ message })`, `OpeningDocument()` from their own files in `features/editor/`.
  - `ResizeHandle({ width, maxWidth, resizeTo, resizeBy })` from `features/timeline/resize-handle.tsx`; `useBinRuns({ documentId, timeline, bin, filter })` from `features/timeline/use-bin-runs.ts`.
  - `AUTH_RETRY_AFTER_HEADER` from `auth-failure.ts`.
  - `TimeTravel.shownVersion: VersionSummary | null` (was `shown`).

- [ ] **Step 1: Pin the 429 message.** Append to `sign-in-page.test.tsx` (add `HttpStatus` to the `@superdoc-history/types` import and `import { authFailureMessage, RETRY_AFTER_HEADER } from './auth-failure';`):

```tsx
const RETRY_SECONDS = '30';

test('a 429 says how many seconds to wait', async () => {
  signInEmail.mockImplementation((async (_values: unknown, capture: { onResponse: (context: { response: Response }) => void }) => {
    const headers = { [RETRY_AFTER_HEADER]: RETRY_SECONDS };
    capture.onResponse({ response: new Response(null, { status: HttpStatus.TooManyRequests, headers }) });
    return { data: null, error: { status: HttpStatus.TooManyRequests } };
  }) as never);
  const user = renderSignInPage();
  await submitCredentials({ user, email: 'ada@example.com', password: 'long-enough-password' });
  const expected = authFailureMessage({ status: HttpStatus.TooManyRequests, retryAfterSeconds: RETRY_SECONDS });
  expect(await screen.findByRole('alert')).toHaveTextContent(expected);
});
```

Run `cd apps/web && npx vitest run src/features/auth/sign-in-page.test.tsx`. Expected: PASS (it pins today's behaviour). Commit:

```bash
git add apps/web/src/features/auth/sign-in-page.test.tsx
git commit -m "test(web): pin the too-many-attempts message on sign-in"
```

- [ ] **Step 2: Move the shared API error and message into `lib/api.ts`.** Add under `ApiRequestError`:

```ts
export class DocumentUnavailableError extends ApiRequestError {}

export function requestFailedMessage({ subject, status }: { subject: string; status: number }): string {
  return `${subject} failed with status ${status}`;
}
```

Delete `DocumentUnavailableError` from `editor-api.ts` and `requestFailedMessage` from `timeline-copy.ts`. Repoint every import: `rg -l "DocumentUnavailableError|requestFailedMessage" apps/web/src` (today: `timeline-api.ts`, `use-selection-summary.ts`, `document-page.tsx`, `editor-api.ts`, `timeline-api.test.ts`) all import them from `@/lib/api`.

- [ ] **Step 3: One import path for `VERSION_FAILED_MESSAGE` (5.7).** Delete `export { VERSION_FAILED_MESSAGE } from '@superdoc-history/types';` from `timeline-copy.ts`. `version-view-page.tsx` and `version-view-page.test.tsx` import it from `@superdoc-history/types`.

- [ ] **Step 4: One hook or component per file in the editor feature (2.12).** Cut from `document-page.tsx`, unchanged except for the return types:

`features/editor/use-document-file.ts`:

```ts
import type { RoomMode } from '@superdoc-history/types';
import { skipToken, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { documentFileQueryKey, fetchDocumentFile } from './editor-api';

export function useDocumentFile({ documentId, roomMode }: { documentId: string; roomMode: RoomMode | undefined }): UseQueryResult<Blob> {
  return useQuery({
    queryKey: documentFileQueryKey({ documentId, roomMode }),
    queryFn: roomMode === undefined ? skipToken : () => fetchDocumentFile({ documentId, roomMode }),
    staleTime: Infinity,
  });
}
```

`features/editor/use-members.ts`:

```ts
import type { DocumentMember } from '@superdoc-history/types';
import { useQuery } from '@tanstack/react-query';
import { DocumentUnavailableError } from '@/lib/api';
import { fetchMembers, MEMBERS_REFRESH_MS, membersQueryKey } from './editor-api';

const NO_MEMBERS: DocumentMember[] = [];

export function useMembers(documentId: string): { members: DocumentMember[]; isUnavailable: boolean } {
  const { data, error } = useQuery({
    queryKey: membersQueryKey(documentId),
    queryFn: () => fetchMembers(documentId),
    refetchInterval: (query) => (query.state.error instanceof DocumentUnavailableError ? false : MEMBERS_REFRESH_MS),
    retry: false,
  });
  const isUnavailable = error instanceof DocumentUnavailableError;
  if (!data) return { members: NO_MEMBERS, isUnavailable };
  return { members: data.members, isUnavailable };
}
```

`features/editor/unavailable-notice.tsx` takes `UnavailableNotice` with its imports (`AppRoute`, `Link`, `BACK_TO_DOCUMENTS_LABEL`), exported. `features/editor/opening-document.tsx` takes lane A's `OpeningDocument` with its imports (`HomeLink`, `Skeleton`, `LOADING_DOCUMENT_MESSAGE`), exported. `document-page.tsx` imports the four and drops the imports only they used.

- [ ] **Step 5: Rename the document page locals (1.15).** In `document-page.tsx`: `freshOpened` → `openedAfterMount`, `setup` → `editorSetup` (every use, including `setup.roomMode`… and `setup ? downloadLiveDocument : null`).

- [ ] **Step 6: Move `ResizeHandle` (2.3).** Create `features/timeline/resize-handle.tsx` with `ResizeKey`, `PRIMARY_BUTTON_PRESSED` and the `ResizeHandle` function exactly as they are in `timeline-panel.tsx`, exported, with the imports they need (`KeyboardEvent`, `PointerEvent` types from `react`, `RESIZE_PANEL_LABEL` from `./timeline-copy`, `MIN_PANEL_WIDTH`, `PANEL_RESIZE_STEP` from `./use-panel-width`). Delete them from `timeline-panel.tsx` and import `ResizeHandle`.

- [ ] **Step 7: Rename the panel locals and name the editor condition (1.14, 3.5).** In `timeline-panel.tsx`: `canRefresh` → `canEdit`, `refresh` → `refreshTopics` (including `refreshTopics.isPending`, `.mutate()`, `.isError`, `.error`). Add, after `canEdit`:

```tsx
const showsEditorActions = isOpen && canEdit;
```

and replace every `isOpen && canEdit` in the JSX with `showsEditorActions` (the Summarize button, the Regroup topics button, both reason paragraphs). `TimelineNotices` keeps its `canRefresh` prop and receives `canRefresh={canEdit}`; `SelectionSummaryCard` receives `canRequest={canEdit}`.

- [ ] **Step 8: Move the bin runs hook and the typing check.** Create `features/timeline/use-bin-runs.ts` with `NO_RUNS`, `NO_BIN_SEGMENT`, `NO_BIN_EDITS_KEY` and `useBinRuns` exactly as in `use-time-travel.ts`, `useBinRuns` exported. Move `isTypingInField` from `use-time-travel.ts` to `lib/keyboard.ts`, exported, under the enum. `use-time-travel.ts` imports both.

- [ ] **Step 9: Rename the time travel state (1.16).** In `use-time-travel.ts`: the `TimeTravel` field `shown` → `shownVersion` (type and returned object: `shownVersion: search.at === null || isShownFailed ? null : shownVersion`), `pinned`/`setPinned` → `pinnedVersion`/`setPinnedVersion`. Consumers: `version-banner.tsx` (`timeTravel.shownVersion`, three uses) and `document-page.tsx` (`version={timeTravel.shownVersion}`).

- [ ] **Step 10: Name the frame index (1.20).** In `version-frame.tsx` `framesAfterShowing`: `existing` → `existingIndex`.

- [ ] **Step 11: Highlights without aliases (1.19).** TypeScript does not carry a narrowing into hoisted function declarations, which is why the aliases exist. Replace the body of `use-run-highlights.ts` below `wasEveryTargetSkipped` with (import `type EditorDocument` from `@/features/editor/highlight-edits`):

```ts
function highlightUntilCancelled({
  superdoc,
  editorDocument,
  runs,
}: {
  superdoc: SuperDoc;
  editorDocument: EditorDocument;
  runs: EditRunView[];
}): () => void {
  let commentIds: string[] = [];
  let isCancelled = false;

  function apply(): Promise<HighlightResult> {
    return highlightEdits({ document: editorDocument, runs }).then((result) => {
      commentIds = result.commentIds;
      if (isCancelled) clearHighlights({ document: editorDocument, commentIds });
      return result;
    });
  }

  function retryOnce(): void {
    superdoc.off(EDITOR_UPDATE_EVENT, retryOnce);
    if (isCancelled) return;
    apply().catch(() => clearHighlights({ document: editorDocument, commentIds }));
  }

  apply()
    .then((result) => {
      if (isCancelled || !wasEveryTargetSkipped(result)) return;
      superdoc.on(EDITOR_UPDATE_EVENT, retryOnce);
    })
    .catch(() => clearHighlights({ document: editorDocument, commentIds }));

  return () => {
    isCancelled = true;
    superdoc.off(EDITOR_UPDATE_EVENT, retryOnce);
    clearHighlights({ document: editorDocument, commentIds });
  };
}

export function useRunHighlights({ superdoc, runs }: { superdoc: SuperDoc | null; runs: EditRunView[] }): void {
  useEffect(() => {
    const editorDocument = superdoc?.activeEditor?.doc;
    if (!superdoc || !editorDocument) return;
    return highlightUntilCancelled({ superdoc, editorDocument, runs });
  }, [superdoc, runs]);
}
```

- [ ] **Step 12: Auth renames and repo-style types (1.6, 5.8).** `auth-failure.ts`: `RETRY_AFTER_HEADER` → `AUTH_RETRY_AFTER_HEADER`; update `use-auth-submit.ts` and the Step 1 test import. In `use-auth-submit.ts` replace the three interfaces and the generic name:

```ts
type ResponseCapture = { onResponse: (context: { response: Response }) => void };
type AuthRequestResult = { error: { status: number } | null };

export function useAuthSubmit<Values extends FieldValues>({
  form,
  request,
}: {
  form: UseFormReturn<Values>;
  request: (values: Values, responseCapture: ResponseCapture) => Promise<AuthRequestResult>;
}) {
```

and `submit(values: Values)` in the body. The two-argument `request` mirrors better-auth's `signIn.email(values, fetchOptions)` and stays positional.

- [ ] **Step 13: Run the gate and check the names are gone.**

```bash
pnpm format:check && pnpm typecheck && (cd apps/web && npx vitest run)
rg -n "freshOpened|\bsetup\b" apps/web/src/features/editor/document-page.tsx
rg -n "timeTravel\.shown\b|\bpinned\b|\bexisting\b|interface |TValues|activeSuperdoc|document: document" apps/web/src --glob '!*.test.*'
rg -n "\bRETRY_AFTER_HEADER\b" apps/web/src/features/auth
rg -n "isOpen && canEdit|canRefresh" apps/web/src/features/timeline/timeline-panel.tsx
```

Expected: the gate passes with every existing test unchanged except the import paths in Steps 2, 3 and 12. The first two `rg` print nothing (`use-editor-setup.ts` keeps its own `setup` state on purpose; only the page local was renamed), the third prints nothing, the fourth prints only `canRefresh={canEdit}`.

- [ ] **Step 14: Commit.**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/keyboard.ts apps/web/src/features/auth/auth-failure.ts apps/web/src/features/auth/use-auth-submit.ts apps/web/src/features/auth/sign-in-page.test.tsx apps/web/src/features/editor/document-page.tsx apps/web/src/features/editor/editor-api.ts apps/web/src/features/editor/use-document-file.ts apps/web/src/features/editor/use-members.ts apps/web/src/features/editor/unavailable-notice.tsx apps/web/src/features/editor/opening-document.tsx apps/web/src/features/timeline/timeline-panel.tsx apps/web/src/features/timeline/resize-handle.tsx apps/web/src/features/timeline/timeline-copy.ts apps/web/src/features/timeline/timeline-api.ts apps/web/src/features/timeline/timeline-api.test.ts apps/web/src/features/timeline/use-time-travel.ts apps/web/src/features/timeline/use-bin-runs.ts apps/web/src/features/timeline/use-selection-summary.ts apps/web/src/features/versions/version-banner.tsx apps/web/src/features/versions/version-frame.tsx apps/web/src/features/versions/version-view-page.tsx apps/web/src/features/versions/version-view-page.test.tsx apps/web/src/features/versions/use-run-highlights.ts
git commit -m "refactor(web): move hooks to their own files and rename what hides its meaning"
```

---

### Task 2: Adopt the shared library helpers

Covers the web call sites of 4.17, 4.18, 4.19 and 4.8.

**Files:**
- Modify: `libs/types/src/text.ts`, `apps/web/src/features/timeline/{selection-summary.ts,timeline-tooltip.tsx,contributor-avatars.tsx,use-timeline-search.ts}`
- Test: `libs/types/src/text.test.ts`

**Interfaces:**
- Consumes: `cellVolume(cell: TimelineCell | undefined): number`, `byVolumeDescending(left: TimelineContributor, right: TimelineContributor): number` from `@superdoc-history/history/timeline`; `NON_NEGATIVE_INTEGER_PATTERN`, `presentOrNull` from `@superdoc-history/types` (lane C1 Task 3).
- Produces: `presentOrNull(value: string | null | undefined): string | null`.

- [x] **Step 1: Write the failing test.** (fe93133) Append to `libs/types/src/text.test.ts`:

```ts
test('presentOrNull reads a missing search parameter as null', () => {
  expect(presentOrNull(new URLSearchParams().get('term'))).toBeNull();
});
```

- [x] **Step 2: Run it and see it fail.** (TS2345 seen) `pnpm --filter @superdoc-history/types typecheck`. Expected: `TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string | undefined'`.

- [x] **Step 3: Commit the red test.** (fe93133)

```bash
git add libs/types/src/text.test.ts
git commit -m "test(types): pin presentOrNull for a missing search parameter"
```

- [x] **Step 4: Implement and adopt.** (d6fdb58) `libs/types/src/text.ts`: the parameter becomes `value: string | null | undefined`.

`use-timeline-search.ts`: delete the local `presentOrNull` and `BIN_START_PATTERN`; import `NON_NEGATIVE_INTEGER_PATTERN, presentOrNull` from `@superdoc-history/types`; `readBinStart` reads `if (!value || !NON_NEGATIVE_INTEGER_PATTERN.test(value)) return null;`.

`selection-summary.ts` `selectionVolume`: `.reduce((total, [, cell]) => total + cellVolume(cell), 0)`, with `import { cellVolume } from '@superdoc-history/history/timeline';`.

`timeline-tooltip.tsx`: the row filter becomes `.filter(({ cell }) => cellVolume(cell) > 0)`, same import.

`contributor-avatars.tsx` (keeps today's author-key tie break):

```tsx
const ranked = [...contributors]
  .sort((left, right) => byVolumeDescending(left, right) || left.authorKey.localeCompare(right.authorKey))
  .slice(0, MAX_AVATARS);
```

- [x] **Step 5: Run the gate.** (web 280 passed, types 11 passed) `pnpm format:check && pnpm typecheck && (cd apps/web && npx vitest run) && pnpm --filter @superdoc-history/types exec vitest run`. Expected: PASS; `selection-summary.test.ts`, `streamgraph.test.tsx` (tooltip rows), `top-edits.test.tsx` (avatars) and `use-timeline-search.test.ts` unchanged.

- [x] **Step 6: Commit.** (d6fdb58)

```bash
git add libs/types/src/text.ts apps/web/src/features/timeline/selection-summary.ts apps/web/src/features/timeline/timeline-tooltip.tsx apps/web/src/features/timeline/contributor-avatars.tsx apps/web/src/features/timeline/use-timeline-search.ts
git commit -m "refactor(web,types): use the shared volume, presence and digit helpers on the web"
```

---

### Task 3: `maxBandVolume` and `authorNames`

Covers 4.30 and 4.31.

**Files:**
- Create: `apps/web/src/features/timeline/max-band-volume.ts`
- Modify: `apps/web/src/features/timeline/{author-of.ts,bin-edits.tsx,top-edits.tsx,streamgraph.tsx,streamgraph-layout.ts,timeline-tooltip.tsx}`
- Test: `apps/web/src/features/timeline/max-band-volume.test.ts`, `apps/web/src/features/timeline/author-of.test.ts` (both new)

**Interfaces:**
- Produces: `maxBandVolume(timeline: DocumentTimeline): number`; `authorNames({ authors, authorKeys }: { authors: Record<string, EventAuthor>; authorKeys: string[] }): string`.

- [ ] **Step 1: Write the failing tests.**

`max-band-volume.test.ts`:

```ts
import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { maxBandVolume } from './max-band-volume';

test('the largest band volume, or zero without bands', () => {
  expect(maxBandVolume(timelineWith({ volumes: [[3, 9], [4, 0]], names: ['Budget', 'Hiring'] }))).toBe(9);
  expect(maxBandVolume(timelineWith({ volumes: [], names: [] }))).toBe(0);
});
```

`author-of.test.ts`:

```ts
import { expect, test } from 'vitest';
import { authorNames } from './author-of';

const AUTHORS = { ana: { id: '1', name: 'Ana' }, bruno: { id: '2', name: 'Bruno' } };

test('author names follow the keys and join with a comma', () => {
  expect(authorNames({ authors: AUTHORS, authorKeys: ['bruno', 'ana'] })).toBe('Bruno, Ana');
});

test('an unknown author key throws instead of printing nothing', () => {
  expect(() => authorNames({ authors: AUTHORS, authorKeys: ['carla'] })).toThrow();
});
```

Inert stubs: `max-band-volume.ts` exports `maxBandVolume` returning `0`; `author-of.ts` exports `authorNames` returning `''`.

- [ ] **Step 2: Run them and see them fail.** `cd apps/web && npx vitest run src/features/timeline/max-band-volume.test.ts src/features/timeline/author-of.test.ts`. Expected: FAIL on `expected 0 to be 9`, `expected '' to be 'Bruno, Ana'` and `expected [Function] to throw`.

- [ ] **Step 3: Commit the red tests.**

```bash
git add apps/web/src/features/timeline/max-band-volume.ts apps/web/src/features/timeline/max-band-volume.test.ts apps/web/src/features/timeline/author-of.ts apps/web/src/features/timeline/author-of.test.ts
git commit -m "test(web): pin the largest band volume and the joined author names"
```

- [ ] **Step 4: Implement.**

`max-band-volume.ts`:

```ts
import type { DocumentTimeline } from '@superdoc-history/types';

export function maxBandVolume(timeline: DocumentTimeline): number {
  return Math.max(0, ...timeline.bands.map((band) => band.volume));
}
```

`author-of.ts`, under `authorOf`:

```ts
const NAME_SEPARATOR = ', ';

export function authorNames({ authors, authorKeys }: { authors: Record<string, EventAuthor>; authorKeys: string[] }): string {
  return authorKeys.map((authorKey) => authorOf({ authors, authorKey }).name).join(NAME_SEPARATOR);
}
```

- [ ] **Step 5: Adopt.** Replace `Math.max(0, ...timeline.bands.map((band) => band.volume))` with `maxBandVolume(timeline)` in `bin-edits.tsx`, `top-edits.tsx`, `streamgraph-layout.ts` (`layoutStreamgraph`) and `streamgraph.tsx` (lane A Task 3). Replace the `authorKeys.map(... authorOf(...).name).join(', ')` expression with `authorNames({ authors: data!.authors, authorKeys: run.authorKeys })` in `bin-edits.tsx` and `authorNames({ authors: timeline.authors, authorKeys: cell!.authorKeys })` in `timeline-tooltip.tsx`; drop the `authorOf` imports they no longer use. Check: `rg -n "bands.map\(\(band\) => band.volume\)|join\(', '\)" apps/web/src --glob '!*.test.*'` prints only the two helper files.

- [ ] **Step 6: Run the gate.** Expected: PASS; `streamgraph.test.tsx`, `timeline-panel.test.tsx` and `top-edits.test.tsx` unchanged.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/features/timeline/max-band-volume.ts apps/web/src/features/timeline/author-of.ts apps/web/src/features/timeline/bin-edits.tsx apps/web/src/features/timeline/top-edits.tsx apps/web/src/features/timeline/streamgraph.tsx apps/web/src/features/timeline/streamgraph-layout.ts apps/web/src/features/timeline/timeline-tooltip.tsx
git commit -m "refactor(web): one largest band volume and one author name list"
```

---

### Task 4: Shared keys, the pointer constant and a flat `nextIndex`

Covers 4.29 and 3.12.

**Files:**
- Create: `apps/web/src/lib/pointer.ts`
- Modify: `apps/web/src/lib/keyboard.ts`, `apps/web/src/features/timeline/{streamgraph.tsx,resize-handle.tsx}`
- Test: `apps/web/src/features/timeline/streamgraph.test.tsx` (one pinning test)

**Interfaces:**
- Produces: `KeyboardKey.ArrowLeft | ArrowRight | Home | End`; `PRIMARY_BUTTON_PRESSED = 1` from `@/lib/pointer`.

- [ ] **Step 1: Pin the arrows without a selection.** Append to `streamgraph.test.tsx`:

```tsx
test.each([
  { key: 'ArrowRight', expected: 0 },
  { key: 'ArrowLeft', expected: 2 },
  { key: 'Home', expected: 0 },
  { key: 'End', expected: 2 },
])('$key without a selection selects bin $expected', ({ key, expected }) => {
  const { onSelectIndex } = renderGraph({ selectedIndex: null });
  fireEvent.keyDown(screen.getByLabelText('Budget, 340 characters'), { key });
  expect(onSelectIndex).toHaveBeenLastCalledWith(expected);
});

test('another key selects nothing', () => {
  const { onSelectIndex } = renderGraph({ selectedIndex: 1 });
  fireEvent.keyDown(screen.getByLabelText('Budget, 340 characters'), { key: 'a' });
  expect(onSelectIndex).not.toHaveBeenCalled();
});
```

(`renderGraph` and the three-bin `timeline` are the file's existing fixtures. If lane A's roving `tabIndex` changed the band's label lookup, use the same lookup the file's other keyboard tests use.) Run `cd apps/web && npx vitest run src/features/timeline/streamgraph.test.tsx`. Expected: PASS. Commit:

```bash
git add apps/web/src/features/timeline/streamgraph.test.tsx
git commit -m "test(web): pin chart keys without a selected bin"
```

- [ ] **Step 2: Implement.** `lib/keyboard.ts` enum:

```ts
export enum KeyboardKey {
  Escape = 'Escape',
  Enter = 'Enter',
  ArrowLeft = 'ArrowLeft',
  ArrowRight = 'ArrowRight',
  Home = 'Home',
  End = 'End',
}
```

`lib/pointer.ts`:

```ts
export const PRIMARY_BUTTON_PRESSED = 1;
```

`streamgraph.tsx`: delete `PRIMARY_BUTTON_PRESSED` and the `NavigationKey` enum; import `KeyboardKey` and `PRIMARY_BUTTON_PRESSED`. `handleKeyDown` tests `event.key === KeyboardKey.Escape`. `nextIndex`:

```tsx
function nextIndex({ key, selectedIndex, lastIndex }: { key: string; selectedIndex: number | null; lastIndex: number }): number | null {
  const isStep = key === KeyboardKey.ArrowRight || key === KeyboardKey.ArrowLeft;
  if (key === KeyboardKey.Home) return 0;
  if (key === KeyboardKey.End) return lastIndex;
  if (!isStep) return null;
  if (selectedIndex === null && key === KeyboardKey.ArrowRight) return 0;
  if (selectedIndex === null) return lastIndex;
  if (key === KeyboardKey.ArrowRight) return Math.min(lastIndex, selectedIndex + 1);
  return Math.max(0, selectedIndex - 1);
}
```

`resize-handle.tsx`: delete `ResizeKey` and `PRIMARY_BUTTON_PRESSED`; import both shared names; `handleKeyDown` reads `if (event.key === KeyboardKey.ArrowLeft) resizeBy(PANEL_RESIZE_STEP);` and `if (event.key === KeyboardKey.ArrowRight) resizeBy(-PANEL_RESIZE_STEP);`.

- [ ] **Step 3: Run the gate.** Expected: PASS, including "arrow keys, End and Escape drive the selection", "ArrowLeft at the first bin stays at the first bin" and "the separator resizes with the arrow keys and never below the minimum". `rg -n "'Arrow(Left|Right)'|= 1;$" apps/web/src --glob '!*.test.*'` prints only `lib/keyboard.ts`, `lib/pointer.ts` and lane A's `SINGLE_COUNT = 1;` in `timeline-copy.ts`.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/lib/keyboard.ts apps/web/src/lib/pointer.ts apps/web/src/features/timeline/streamgraph.tsx apps/web/src/features/timeline/resize-handle.tsx
git commit -m "refactor(web): share the arrow keys and the pointer button, and flatten the chart key logic"
```

---

### Task 5: Streamgraph labels without a hidden side effect

Covers 2.13.

**Files:**
- Modify: `apps/web/src/features/timeline/streamgraph-layout.ts`
- Test: `apps/web/src/features/timeline/streamgraph-layout.test.ts` (one characterization test)

**Interfaces:**
- Produces: nothing new; `layoutStreamgraph` keeps its signature and output.

- [ ] **Step 1: Freeze today's label positions.** Append to `streamgraph-layout.test.ts`:

```ts
test('label positions stay where they are for a crowded chart', () => {
  const timeline = timelineWith({
    volumes: Array.from({ length: 40 }, (_, index) => [400, 380, 360, index % 2 === 0 ? 300 : 20, 15]),
    names: ['Budget', 'Hiring', 'Marketing', 'Legal', 'Tiny'],
  });
  const labels = layoutStreamgraph({ timeline, width: 480 }).shapes.map((shape) => ({ name: shape.band.name, label: shape.label }));
  expect(labels).toMatchInlineSnapshot();
});
```

Run `cd apps/web && npx vitest run src/features/timeline/streamgraph-layout.test.ts` locally (not with `CI=true`), so Vitest writes the snapshot into the file. Confirm the written snapshot has at least one `null` label and at least two placed labels; if not, change the volumes until it does, then re-run. Commit:

```bash
git add apps/web/src/features/timeline/streamgraph-layout.test.ts
git commit -m "test(web): freeze the streamgraph label positions"
```

- [ ] **Step 2: Implement.** `placeLabel` stops pushing. It becomes `labelBoxOf`, which returns the label and its box, or `null` when it does not fit or collides:

```ts
type PlacedLabel = { label: { x: number; y: number }; box: LabelBox };

function labelBoxOf({
  band,
  points,
  x,
  y,
  placed,
}: {
  band: TimelineBand;
  points: StackSeries;
  x: ScaleLinear<number, number>;
  y: ScaleLinear<number, number>;
  placed: LabelBox[];
}): PlacedLabel | null {
  ...today's body down to the `placed.some(...)` check, unchanged...
  if (placed.some((other) => intersects({ first: box, second: other }))) return null;
  return { label: { x: centerX, y: centerY }, box };
}
```

In `layoutStreamgraph`, build the unlabelled shapes with `map`, then place labels in a `reduce` that carries the placed boxes:

```ts
const unlabelledShapes = [...series]
  .sort((left, right) => bandOf({ timeline, id: right.key }).volume - bandOf({ timeline, id: left.key }).volume)
  .map((points) => {
    const band = bandOf({ timeline, id: points.key });
    const path = shapeOf(points);
    if (!path) throw new EmptyBandPathError(band.id);
    return { band, points, path: `${path}Z`, saturation: saturationOf({ volume: band.volume, maxVolume }) };
  });
const { shapes } = unlabelledShapes.reduce<{ shapes: BandShape[]; placed: LabelBox[] }>(
  ({ shapes: done, placed }, { band, points, path, saturation }) => {
    const placedLabel = labelBoxOf({ band, points, x, y, placed });
    if (placedLabel === null) return { shapes: [...done, { band, path, saturation, label: null }], placed };
    return { shapes: [...done, { band, path, saturation, label: placedLabel.label }], placed: [...placed, placedLabel.box] };
  },
  { shapes: [], placed: [] },
);
```

Delete the `const placed: LabelBox[] = [];` line.

- [ ] **Step 3: Run the gate.** Expected: PASS, including the frozen snapshot and "labels sit inside thick bands and never overlap".

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/features/timeline/streamgraph-layout.ts
git commit -m "refactor(web): place streamgraph labels in a reduce instead of a hidden push"
```

---

### Task 6: `readJson`, `assertOk` and `assertDocumentAvailable`

Covers 4.20 and the rest of 4.21.

**Files:**
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/features/timeline/timeline-api.ts`, `apps/web/src/features/editor/editor-api.ts`, `apps/web/src/features/documents/{documents-api.ts,documents-copy.ts,use-documents.ts}`, `apps/web/src/features/sharing/share-api.ts`, `apps/web/src/features/auth/use-session.ts`
- Modify (mock factory only): `apps/web/src/features/auth/redirect-if-session.test.tsx`, `apps/web/src/features/auth/sign-out-flow.test.tsx`
- Test: `apps/web/src/lib/api.test.ts` (new)

**Interfaces:**
- Consumes: `DocumentUnavailableError`, `requestFailedMessage` from Task 1.
- Produces: `assertDocumentAvailable(response: Response): void`; `assertOk({ response, subject }: { response: Response; subject: string }): void`; `readJson<Body>({ response, subject }: { response: Response; subject: string }): Promise<Body>`; `fetchDocuments(): Promise<DocumentsList>` from `documents-api.ts`; `UPLOAD_SUBJECT = 'Upload'`, `CREATE_SUBJECT = 'Create'` in `documents-copy.ts`.

- [ ] **Step 1: Write the failing tests.** `apps/web/src/lib/api.test.ts`:

```ts
import { DOCUMENT_UNAVAILABLE_MESSAGE, HttpStatus } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { ApiRequestError, assertDocumentAvailable, assertOk, DocumentUnavailableError, readJson, requestFailedMessage } from './api';

const SUBJECT = 'Members request';
const BODY = { members: [] };

test('readJson returns the body of a successful response', async () => {
  await expect(readJson({ response: new Response(JSON.stringify(BODY)), subject: SUBJECT })).resolves.toEqual(BODY);
});

test('readJson names the subject and the status of a failed response', async () => {
  await expect(readJson({ response: new Response(null, { status: HttpStatus.Forbidden }), subject: SUBJECT })).rejects.toEqual(
    new ApiRequestError(requestFailedMessage({ subject: SUBJECT, status: HttpStatus.Forbidden })),
  );
});

test('assertOk lets a successful response through and refuses a failed one', () => {
  expect(() => assertOk({ response: new Response(null, { status: HttpStatus.NoContent }), subject: SUBJECT })).not.toThrow();
  expect(() => assertOk({ response: new Response(null, { status: HttpStatus.InternalServerError }), subject: SUBJECT })).toThrow(
    requestFailedMessage({ subject: SUBJECT, status: HttpStatus.InternalServerError }),
  );
});

test('a 404 means the document is unavailable', () => {
  expect(() => assertDocumentAvailable(new Response(null, { status: HttpStatus.NotFound }))).toThrow(
    new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE),
  );
  expect(() => assertDocumentAvailable(new Response(null, { status: HttpStatus.Forbidden }))).not.toThrow();
});
```

Inert stubs in `lib/api.ts`: `assertDocumentAvailable` and `assertOk` do nothing; `readJson` returns `response.json()`.

- [ ] **Step 2: Run it and see it fail.** `cd apps/web && npx vitest run src/lib/api.test.ts`. Expected: FAIL on the `readJson` rejection assertion (the stub rejects with a `SyntaxError` from parsing the empty 403 body, so `rejects.toEqual(new ApiRequestError(...))` fails with `expected SyntaxError … to deeply equal ApiRequestError …`), and twice on `expected [Function] to throw`.

- [ ] **Step 3: Commit the red test.**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts
git commit -m "test(web): pin one JSON reader and one failed-request message"
```

- [ ] **Step 4: Implement in `lib/api.ts`** (add `DOCUMENT_UNAVAILABLE_MESSAGE` and `HttpStatus` to the types import, which becomes a value import):

```ts
export function assertDocumentAvailable(response: Response): void {
  if (response.status === HttpStatus.NotFound) throw new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE);
}

export function assertOk({ response, subject }: { response: Response; subject: string }): void {
  if (!response.ok) throw new ApiRequestError(requestFailedMessage({ subject, status: response.status }));
}

export async function readJson<Body>({ response, subject }: { response: Response; subject: string }): Promise<Body> {
  assertOk({ response, subject });
  return response.json();
}
```

- [ ] **Step 5: Adopt.** Every message stays byte-identical because `requestFailedMessage` writes `${subject} failed with status ${status}`.

`timeline-api.ts`: delete the local `assertDocumentAvailable` and import it. Each `if (!response.ok) throw new ApiRequestError(requestFailedMessage({ subject: X, status: response.status })); return response.json();` pair becomes `return readJson<T>({ response, subject: X })`, with `T` the function's return body type: `fetchTimeline` (`'Timeline request'`), `fetchSummaries` (`'Summaries request'`), `refreshTopics` (`'Topics refresh'`), `fetchSelectionSummary` (`'Selection summary request'`), `requestSelectionSummary` (`SUMMARIZE_EDITS_SUBJECT`), `fetchBinEdits` (`'Bin edits request'`). `fetchVersion` and `unavailableMessage` stay as they are.

`editor-api.ts`:

```ts
export async function fetchMembers(documentId: string): Promise<DocumentMembers> {
  const response = await apiGet(documentApiPath({ documentId, resource: DocumentResource.Members }));
  assertDocumentAvailable(response);
  return readJson<DocumentMembers>({ response, subject: 'Members request' });
}
```

`fetchShareLinks` → `readJson<ShareLinks>({ response, subject: 'Share links request' })`; `rotateShareLink` → `readJson<ShareLinks>({ response, subject: 'Rotate' })`; `renameDocument` → `assertOk({ response, subject: 'Rename' })`; `deleteDocument` → `assertOk({ response, subject: 'Delete' })`. `openDocument` and `fetchDocumentFile` keep their lines: they throw copy, not a status.

`documents-copy.ts`: replace `UPLOAD_FAILED_MESSAGE` and `CREATE_FAILED_MESSAGE` with `export const UPLOAD_SUBJECT = 'Upload';` and `export const CREATE_SUBJECT = 'Create';`. `documents-api.ts`: `uploadDocument` keeps its 413 and 415 lines, then `return readJson<DocumentSummary>({ response, subject: UPLOAD_SUBJECT });`; `createBlankDocument` → `readJson<DocumentSummary>({ response, subject: CREATE_SUBJECT })`. Move `fetchDocuments` here from `use-documents.ts`, exported:

```ts
export async function fetchDocuments(): Promise<DocumentsList> {
  const response = await apiGet(ApiPath.Documents);
  return readJson<DocumentsList>({ response, subject: 'Documents request' });
}
```

`use-documents.ts` imports `fetchDocuments`. `share-api.ts` → `readJson<AcceptedShareLink>({ response, subject: 'Accepting the link' })` after its 404 line. `use-session.ts` `fetchMe`:

```ts
const body = await readJson<{ user: SessionUser | null }>({ response, subject: 'Session request' });
return body.user;
```

`redirect-if-session.test.tsx` and `sign-out-flow.test.tsx` mock `@/lib/api` with a factory that returns only `{ apiGet }`, so `fetchMe` would import an undefined `readJson`. Change both factories to the partial form `router.test.tsx` already uses, and nothing else in those files:

```ts
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), apiGet: vi.fn() }));
```

Check: `rg -n "vi.mock\('@/lib/api', \(\)" apps/web/src` prints nothing. Check: `rg -n "response.ok" apps/web/src --glob '!*.test.*'` prints only `lib/api.ts`, `openDocument` and `fetchDocumentFile` in `editor-api.ts`, and `fetchVersion` in `timeline-api.ts` (it maps a failure to `VersionLoadKind.Failed`, not an error).

- [ ] **Step 6: Run the gate.** Expected: PASS; `redirect-if-session.test.tsx` and `sign-out-flow.test.tsx` (with the partial mock), `timeline-api.test.ts` (its `requestFailedMessage` assertions), `upload-dialog.test.tsx`, `share-dialog.test.tsx`, `share-landing-page.test.tsx`, `documents-page.test.tsx` and `document-page.test.tsx` unchanged.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/lib/api.ts apps/web/src/features/timeline/timeline-api.ts apps/web/src/features/editor/editor-api.ts apps/web/src/features/documents/documents-api.ts apps/web/src/features/documents/documents-copy.ts apps/web/src/features/documents/use-documents.ts apps/web/src/features/sharing/share-api.ts apps/web/src/features/auth/use-session.ts apps/web/src/features/auth/redirect-if-session.test.tsx apps/web/src/features/auth/sign-out-flow.test.tsx
git commit -m "refactor(web): read every JSON response and failed status in one place"
```

---

### Task 7: `documentQueryKey`

Covers 4.22.

**Files:**
- Modify: `apps/web/src/features/documents/documents-api.ts`, `apps/web/src/features/editor/editor-api.ts`, `apps/web/src/features/timeline/{timeline-api.ts,use-topics.ts}`
- Test: `apps/web/src/features/documents/document-query-keys.test.ts` (new)

**Interfaces:**
- Produces: `documentQueryKey({ documentId, segments }: { documentId: string; segments: unknown[] }): unknown[]`; `DOCUMENT_FILE_QUERY_KEY = ['document-file']`. Every existing builder keeps its name and parameters.

- [x] **Step 1: Pin today's keys and their scope.** (c21f651) Create `document-query-keys.test.ts`:

```ts
import { DocumentResource, RoomMode, type EditSelection, type TimelineFilter } from '@superdoc-history/types';
import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { documentFileQueryKey, membersQueryKey, openedDocumentQueryKey, shareLinksQueryKey } from '@/features/editor/editor-api';
import {
  binEditsQueryKey,
  selectionSummaryQueryKey,
  summariesQueryKey,
  timelineQueryKey,
  topicsQueryKey,
  versionQueryKey,
} from '@/features/timeline/timeline-api';
import { DOCUMENTS_QUERY_KEY } from './documents-api';

const DOCUMENT_ID = 'doc-1';
const FILTER: TimelineFilter = { term: 'budget', author: null };
const SELECTION: EditSelection = { term: null, author: null, topic: 'band-0', at: null };
const BIN_START = 1_792_165_200_000;
const BIN_MS = 60_000;
const SEQUENCE = 7;

function keysMatching({ queryClient, queryKey }: { queryClient: QueryClient; queryKey: unknown[] }): unknown[][] {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey })
    .map((query) => [...query.queryKey]);
}

test('every document key keeps its value', () => {
  expect(openedDocumentQueryKey(DOCUMENT_ID)).toEqual(['documents', DOCUMENT_ID]);
  expect(membersQueryKey(DOCUMENT_ID)).toEqual(['documents', DOCUMENT_ID, DocumentResource.Members]);
  expect(shareLinksQueryKey(DOCUMENT_ID)).toEqual(['documents', DOCUMENT_ID, DocumentResource.ShareLinks]);
  expect(documentFileQueryKey({ documentId: DOCUMENT_ID, roomMode: RoomMode.Join })).toEqual(['document-file', DOCUMENT_ID, RoomMode.Join]);
  expect(timelineQueryKey({ documentId: DOCUMENT_ID, filter: FILTER })).toEqual([
    'documents',
    DOCUMENT_ID,
    DocumentResource.Timeline,
    FILTER,
  ]);
  expect(summariesQueryKey(DOCUMENT_ID)).toEqual(['documents', DOCUMENT_ID, DocumentResource.Summaries]);
  expect(topicsQueryKey(DOCUMENT_ID)).toEqual(['documents', DOCUMENT_ID, DocumentResource.Topics]);
  expect(binEditsQueryKey({ documentId: DOCUMENT_ID, binStart: BIN_START, binMs: BIN_MS, filter: FILTER })).toEqual([
    'documents',
    DOCUMENT_ID,
    DocumentResource.Timeline,
    'edits',
    BIN_START,
    BIN_MS,
    FILTER,
  ]);
  expect(versionQueryKey({ documentId: DOCUMENT_ID, sequence: SEQUENCE })).toEqual([
    'documents',
    DOCUMENT_ID,
    DocumentResource.Versions,
    SEQUENCE,
  ]);
  expect(selectionSummaryQueryKey({ documentId: DOCUMENT_ID, selection: SELECTION })).toEqual([
    'documents',
    DOCUMENT_ID,
    DocumentResource.Summaries,
    'selection',
    SELECTION,
  ]);
});

test('the timeline prefix reaches the timeline and its bin edits, and the documents prefix never reaches the file', () => {
  const queryClient = new QueryClient();
  const timelineKey = timelineQueryKey({ documentId: DOCUMENT_ID, filter: FILTER });
  const binEditsKey = binEditsQueryKey({ documentId: DOCUMENT_ID, binStart: BIN_START, binMs: BIN_MS, filter: FILTER });
  const fileKey = documentFileQueryKey({ documentId: DOCUMENT_ID, roomMode: RoomMode.Create });
  [timelineKey, binEditsKey, summariesQueryKey(DOCUMENT_ID), topicsQueryKey(DOCUMENT_ID), membersQueryKey(DOCUMENT_ID), fileKey].forEach(
    (queryKey) => queryClient.setQueryData(queryKey, {}),
  );
  const timelinePrefix = [...DOCUMENTS_QUERY_KEY, DOCUMENT_ID, DocumentResource.Timeline];
  expect(keysMatching({ queryClient, queryKey: timelinePrefix })).toEqual([timelineKey, binEditsKey]);
  expect(keysMatching({ queryClient, queryKey: DOCUMENTS_QUERY_KEY })).not.toContainEqual(fileKey);
});
```

Run `cd apps/web && npx vitest run src/features/documents/document-query-keys.test.ts`. Expected: PASS (it pins today). Commit:

```bash
git add apps/web/src/features/documents/document-query-keys.test.ts
git commit -m "test(web): pin every document query key and its invalidation scope"
```

- [x] **Step 2: Write the failing test.** (fdbfeca) Append (import `documentQueryKey` from `./documents-api`):

```ts
test('a document key nests its segments under the documents key', () => {
  const membersKey = documentQueryKey({ documentId: DOCUMENT_ID, segments: [DocumentResource.Members] });
  expect(membersKey).toEqual([...DOCUMENTS_QUERY_KEY, DOCUMENT_ID, DocumentResource.Members]);
  expect(documentQueryKey({ documentId: DOCUMENT_ID, segments: [] })).toEqual([...DOCUMENTS_QUERY_KEY, DOCUMENT_ID]);
});
```

Inert stub in `documents-api.ts`: `documentQueryKey` returns `[]`.

- [x] **Step 3: Run it and see it fail.** (expected [] to deeply equal [ documents, doc-1, members ]) Same command. Expected: FAIL on `expected [] to deeply equal [ 'documents', 'doc-1', 'members' ]`.

- [x] **Step 4: Commit the red test.** (fdbfeca)

```bash
git add apps/web/src/features/documents/documents-api.ts apps/web/src/features/documents/document-query-keys.test.ts
git commit -m "test(web): pin one builder for document query keys"
```

- [x] **Step 5: Implement and adopt.** (5b323e1) `documents-api.ts`:

```ts
export const DOCUMENTS_QUERY_KEY = ['documents'];
export const DOCUMENT_FILE_QUERY_KEY = ['document-file'];

export function documentQueryKey({ documentId, segments }: { documentId: string; segments: unknown[] }): unknown[] {
  return [...DOCUMENTS_QUERY_KEY, documentId, ...segments];
}
```

`editor-api.ts`: `openedDocumentQueryKey` → `documentQueryKey({ documentId, segments: [] })`; `membersQueryKey` → `segments: [DocumentResource.Members]`; `shareLinksQueryKey` → `segments: [DocumentResource.ShareLinks]`; all three now return `unknown[]`. `documentFileQueryKey` returns `[...DOCUMENT_FILE_QUERY_KEY, documentId, roomMode]` and stays outside the documents hierarchy on purpose (spec, items corrected).

`timeline-api.ts`: `timelineQueryKey` → `segments: [DocumentResource.Timeline, filter]`; `summariesQueryKey` → `[DocumentResource.Summaries]`; `topicsQueryKey` → `[DocumentResource.Topics]`; `binEditsQueryKey` → `[DocumentResource.Timeline, EDITS_SEGMENT, binStart, binMs, filter]`; `versionQueryKey` → `[DocumentResource.Versions, sequence]`; `selectionSummaryQueryKey` stays `[...summariesQueryKey(documentId), SELECTION_SEGMENT, selection]`. Return types become `unknown[]`. Drop the `DOCUMENTS_QUERY_KEY` import.

`use-topics.ts`: the first invalidation becomes `queryClient.invalidateQueries({ queryKey: documentQueryKey({ documentId, segments: [DocumentResource.Timeline] }) })`, importing `documentQueryKey` instead of `DOCUMENTS_QUERY_KEY`.

Check: `rg -n "\.\.\.DOCUMENTS_QUERY_KEY|'document-file'" apps/web/src --glob '!*.test.*'` prints only `documents-api.ts`.

- [x] **Step 6: Run the gate.** (web 283 passed) Expected: PASS, including the two pins from Step 1 unchanged.

- [x] **Step 7: Commit.** (5b323e1)

```bash
git add apps/web/src/features/documents/documents-api.ts apps/web/src/features/editor/editor-api.ts apps/web/src/features/timeline/timeline-api.ts apps/web/src/features/timeline/use-topics.ts
git commit -m "refactor(web): build every document query key from one prefix"
```

---

### Task 8: `pollWhileAvailable(interval)`

Covers 4.23.

**Files:**
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/features/timeline/{timeline-api.ts,use-timeline.ts,use-summaries.ts,bin-edits.tsx,use-bin-runs.ts,use-selection-summary.ts}`, `apps/web/src/features/editor/use-members.ts`
- Test: `apps/web/src/lib/api.test.ts`

**Interfaces:**
- Produces: `type PolledQuery = { state: { error: Error | null } }`; `pollWhileAvailable(intervalMs: number): (query: PolledQuery) => number | false` from `@/lib/api`. `timeline-api.ts` no longer exports `pollWhileAvailable`; `TIMELINE_POLL_MS` stays there.

- [ ] **Step 1: Write the failing test.** Append to `api.test.ts` (import `pollWhileAvailable`):

```ts
const INTERVAL_MS = 5000;

test('polling continues at its interval until the document is gone', () => {
  const poll = pollWhileAvailable(INTERVAL_MS);
  expect(poll({ state: { error: null } })).toBe(INTERVAL_MS);
  expect(poll({ state: { error: new ApiRequestError('busy') } })).toBe(INTERVAL_MS);
  expect(poll({ state: { error: new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE) } })).toBe(false);
});
```

Inert stub: `pollWhileAvailable` returns `() => false`.

- [ ] **Step 2: Run it and see it fail.** `cd apps/web && npx vitest run src/lib/api.test.ts`. Expected: FAIL on `expected false to be 5000`.

- [ ] **Step 3: Commit the red test.**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts
git commit -m "test(web): pin polling that stops when the document is gone"
```

- [ ] **Step 4: Implement and adopt.** `lib/api.ts`:

```ts
type PolledQuery = { state: { error: Error | null } };

export function pollWhileAvailable(intervalMs: number): (query: PolledQuery) => number | false {
  return function pollUnlessUnavailable(query: PolledQuery): number | false {
    if (query.state.error instanceof DocumentUnavailableError) return false;
    return intervalMs;
  };
}
```

Delete `pollWhileAvailable` from `timeline-api.ts`. `use-timeline.ts`, `use-summaries.ts`, `bin-edits.tsx` and `use-bin-runs.ts` read `refetchInterval: pollWhileAvailable(TIMELINE_POLL_MS)`, importing `pollWhileAvailable` from `@/lib/api` and `TIMELINE_POLL_MS` from `./timeline-api`. `use-members.ts`: `refetchInterval: pollWhileAvailable(MEMBERS_REFRESH_MS)`. `use-selection-summary.ts`:

```ts
function pollWhileRunning(query: { state: { data: SelectionSummaryView | undefined; error: Error | null } }): number | false {
  if (query.state.data?.state !== SelectionSummaryState.Running) return false;
  return pollWhileAvailable(TIMELINE_POLL_MS)(query);
}
```

and drop its `DocumentUnavailableError` import. Check: `rg -n "instanceof DocumentUnavailableError" apps/web/src --glob '!*.test.*'` prints `lib/api.ts` and `use-members.ts` (`isUnavailable`) only.

- [ ] **Step 5: Run the gate.** Expected: PASS, including the four Review Focus 2 tests unchanged.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/lib/api.ts apps/web/src/features/timeline/timeline-api.ts apps/web/src/features/timeline/use-timeline.ts apps/web/src/features/timeline/use-summaries.ts apps/web/src/features/timeline/bin-edits.tsx apps/web/src/features/timeline/use-bin-runs.ts apps/web/src/features/timeline/use-selection-summary.ts apps/web/src/features/editor/use-members.ts
git commit -m "refactor(web): one poll predicate that stops on a missing document"
```

---

### Task 9: Retry-after in milliseconds and `useResetAfterRetry`

Covers 1.17, 4.24 and the web site of 4.6.

**Files:**
- Create: `apps/web/src/lib/use-reset-after-retry.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/features/timeline/{timeline-api.ts,use-topics.ts,use-selection-summary.ts,selection-summary-card.tsx}`
- Test: `apps/web/src/lib/use-reset-after-retry.test.ts` (new), `apps/web/src/features/timeline/timeline-api.test.ts`

**Interfaces:**
- Consumes: `secondsRoundedUp(milliseconds: number): number` from `@superdoc-history/types` (lane C1).
- Produces: `RetryLaterError` (`new RetryLaterError({ message, retryAfterMs })`, `readonly retryAfterMs: number`) from `@/lib/api`; `TopicsRefreshTooSoonError` and `SummaryTooSoonError` extend it and keep their one-argument constructors (`retryAfterMs`); `useResetAfterRetry({ error, reset }: { error: Error | null; reset: () => void }): void`.

- [x] **Step 1: Write the failing tests.** (ab16839) `use-reset-after-retry.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiRequestError, RetryLaterError } from './api';
import { useResetAfterRetry } from './use-reset-after-retry';

const RETRY_AFTER_MS = 3000;
const TOO_SOON = new RetryLaterError({ message: 'Too soon', retryAfterMs: RETRY_AFTER_MS });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('a retry-later error resets once its wait is over', () => {
  const reset = vi.fn();
  renderHook(() => useResetAfterRetry({ error: TOO_SOON, reset }));
  vi.advanceTimersByTime(RETRY_AFTER_MS - 1);
  expect(reset).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(reset).toHaveBeenCalledTimes(1);
});

test('any other error, or none, never resets', () => {
  const reset = vi.fn();
  const { rerender } = renderHook(({ error }: { error: Error | null }) => useResetAfterRetry({ error, reset }), {
    initialProps: { error: new ApiRequestError('failed') as Error | null },
  });
  rerender({ error: null });
  vi.advanceTimersByTime(RETRY_AFTER_MS);
  expect(reset).not.toHaveBeenCalled();
});

test('unmounting before the wait cancels the reset', () => {
  const reset = vi.fn();
  const { unmount } = renderHook(() => useResetAfterRetry({ error: TOO_SOON, reset }));
  unmount();
  vi.advanceTimersByTime(RETRY_AFTER_MS);
  expect(reset).not.toHaveBeenCalled();
});
```

In `timeline-api.test.ts`, the two summary assertions switch to milliseconds: the test "a summary requested too soon carries the seconds from Retry-After" is renamed "a summary requested too soon carries the wait from Retry-After" and expects `{ message: SELECTION_SUMMARY_TOO_SOON_MESSAGE, retryAfterMs: 12 * SECOND_MS }`; the `test.each([null, 'soon'])` expects `{ retryAfterMs: MIN_RETRY_AFTER_MS }`.

Inert stubs: `lib/api.ts` exports `RetryLaterError` (extends `ApiRequestError`, stores `retryAfterMs`, final shape); `use-reset-after-retry.ts` exports a `useResetAfterRetry` that does nothing.

- [x] **Step 2: Run them and see them fail.** (spy 0 times; retryAfterSeconds still present) `cd apps/web && npx vitest run src/lib/use-reset-after-retry.test.ts src/features/timeline/timeline-api.test.ts`. Expected: FAIL on `expected "spy" to be called 1 times, but got 0 times` and on the missing `retryAfterMs` property (the object still carries `retryAfterSeconds: 12`).

- [x] **Step 3: Commit the red tests.** (ab16839)

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/use-reset-after-retry.ts apps/web/src/lib/use-reset-after-retry.test.ts apps/web/src/features/timeline/timeline-api.test.ts
git commit -m "test(web): pin one retry-later error in milliseconds and its reset"
```

- [x] **Step 4: Implement.** (3f032ff) `lib/api.ts`:

```ts
export class RetryLaterError extends ApiRequestError {
  readonly retryAfterMs: number;

  constructor({ message, retryAfterMs }: { message: string; retryAfterMs: number }) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}
```

`lib/use-reset-after-retry.ts`:

```ts
import { useEffect } from 'react';
import { RetryLaterError } from './api';

export function useResetAfterRetry({ error, reset }: { error: Error | null; reset: () => void }): void {
  useEffect(() => {
    if (!(error instanceof RetryLaterError)) return;
    const timer = setTimeout(reset, error.retryAfterMs);
    return () => clearTimeout(timer);
  }, [error, reset]);
}
```

`timeline-api.ts`:

```ts
export class TopicsRefreshTooSoonError extends RetryLaterError {
  constructor(retryAfterMs: number) {
    super({ message: TOPICS_REFRESH_TOO_SOON_MESSAGE, retryAfterMs });
  }
}

export class SummaryTooSoonError extends RetryLaterError {
  constructor(retryAfterMs: number) {
    super({ message: SELECTION_SUMMARY_TOO_SOON_MESSAGE, retryAfterMs });
  }
}
```

and in `requestSelectionSummary`: `throw new SummaryTooSoonError(readRetryAfterMs(response));`.

`use-topics.ts`: replace the `useEffect` block with `useResetAfterRetry({ error, reset });`, drop the `useEffect` and `TopicsRefreshTooSoonError` imports. `use-selection-summary.ts` `useSummarizeEdits`: the same, drop `SummaryTooSoonError` and `SECOND_MS` from its imports. `selection-summary-card.tsx` `errorMessage`:

```tsx
if (error instanceof SummaryTooSoonError) return `${error.message} ${retryInLabel(secondsRoundedUp(error.retryAfterMs))}`;
```

importing `secondsRoundedUp` from `@superdoc-history/types`. Check: `rg -n "retryAfterSeconds|\* SECOND_MS\)|/ SECOND_MS" apps/web/src/features/timeline` prints nothing.

- [x] **Step 5: Run the gate.** (web 286 passed) Expected: PASS; `timeline-panel.test.tsx` "a refresh that is too soon explains why", "the too-soon notice goes away when the cooldown ends", "a request too soon shows the seconds from Retry-After" and "the summary cooldown message goes away when the cooldown ends" unchanged.

- [x] **Step 6: Commit.** (3f032ff)

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/use-reset-after-retry.ts apps/web/src/features/timeline/timeline-api.ts apps/web/src/features/timeline/use-topics.ts apps/web/src/features/timeline/use-selection-summary.ts apps/web/src/features/timeline/selection-summary-card.tsx
git commit -m "refactor(web): keep retry waits in milliseconds and reset them in one hook"
```

---

### Task 10: `useWindowMessage` and `useEscapeKey` in the version frame and page

Covers 4.25 (the frame and page half), 3.13.

**Files:**
- Create: `apps/web/src/lib/use-window-message.ts`, `apps/web/src/lib/use-escape-key.ts`
- Modify: `apps/web/src/features/versions/{version-frame.tsx,version-view-page.tsx}`
- Test: `apps/web/src/lib/use-window-message.test.ts`, `apps/web/src/lib/use-escape-key.test.ts` (both new)

**Interfaces:**
- Produces: `useWindowMessage(handler: (event: MessageEvent) => void): void`; `useEscapeKey({ isEnabled, onEscape }: { isEnabled: boolean; onEscape: (event: KeyboardEvent) => void }): void`. Both always call the latest handler and subscribe once per enable.

- [ ] **Step 1: Write the failing tests.**

`use-window-message.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useWindowMessage } from './use-window-message';

function postMessage(): void {
  window.dispatchEvent(new MessageEvent('message', { data: 'ping' }));
}

test('a window message reaches the latest handler and none after unmount', () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = renderHook(({ handler }) => useWindowMessage(handler), { initialProps: { handler: first } });
  rerender({ handler: second });
  postMessage();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  unmount();
  postMessage();
  expect(second).toHaveBeenCalledTimes(1);
});
```

`use-escape-key.test.ts`:

```ts
import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { KeyboardKey } from './keyboard';
import { useEscapeKey } from './use-escape-key';

afterEach(() => document.body.replaceChildren());

test('Escape calls the latest handler while enabled', () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = renderHook(({ onEscape }) => useEscapeKey({ isEnabled: true, onEscape }), { initialProps: { onEscape: first } });
  rerender({ onEscape: second });
  fireEvent.keyDown(document.body, { key: KeyboardKey.Escape });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

test('a disabled hook, another key and a handled Escape do nothing', () => {
  const onEscape = vi.fn();
  const { rerender } = renderHook(({ isEnabled }) => useEscapeKey({ isEnabled, onEscape }), { initialProps: { isEnabled: false } });
  fireEvent.keyDown(document.body, { key: KeyboardKey.Escape });
  rerender({ isEnabled: true });
  fireEvent.keyDown(document.body, { key: KeyboardKey.Enter });
  const handled = new KeyboardEvent('keydown', { key: KeyboardKey.Escape, bubbles: true, cancelable: true });
  handled.preventDefault();
  document.body.dispatchEvent(handled);
  expect(onEscape).not.toHaveBeenCalled();
});

test('an Escape stopped before it reaches the document does nothing', () => {
  const onEscape = vi.fn();
  const inner = document.createElement('div');
  document.body.append(inner);
  inner.addEventListener('keydown', (event) => event.stopPropagation());
  renderHook(() => useEscapeKey({ isEnabled: true, onEscape }));
  fireEvent.keyDown(inner, { key: KeyboardKey.Escape });
  expect(onEscape).not.toHaveBeenCalled();
});
```

Inert stubs: both hooks exported, doing nothing.

- [ ] **Step 2: Run them and see them fail.** `cd apps/web && npx vitest run src/lib/use-window-message.test.ts src/lib/use-escape-key.test.ts`. Expected: FAIL on `expected "spy" to be called 1 times, but got 0 times` in the two "latest handler" tests (the other two pass against the stub and keep passing).

- [ ] **Step 3: Commit the red tests.**

```bash
git add apps/web/src/lib/use-window-message.ts apps/web/src/lib/use-window-message.test.ts apps/web/src/lib/use-escape-key.ts apps/web/src/lib/use-escape-key.test.ts
git commit -m "test(web): pin the window message and Escape listener hooks"
```

- [ ] **Step 4: Implement.**

`lib/use-window-message.ts`:

```ts
import { useEffect, useRef } from 'react';

export function useWindowMessage(handler: (event: MessageEvent) => void): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      handlerRef.current(event);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
}
```

`lib/use-escape-key.ts`:

```ts
import { useEffect, useRef } from 'react';
import { KeyboardKey } from './keyboard';

export function useEscapeKey({ isEnabled, onEscape }: { isEnabled: boolean; onEscape: (event: KeyboardEvent) => void }): void {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!isEnabled) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== KeyboardKey.Escape || event.defaultPrevented) return;
      onEscapeRef.current(event);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled]);
}
```

- [ ] **Step 5: Adopt in the frame and the page.** `version-frame.tsx`: delete `onFailedRef`, `onExitRef`, their effect and the message effect; add, after the `[version]` effect:

```tsx
useWindowMessage((event) => {
  elements.current.forEach((element, sequence) => {
    const message = readViewerMessage({ event, expectedSource: element.contentWindow });
    if (message === null) return;
    if (message.kind === ViewerMessageKind.Ready) setFrames((current) => framesAfterReady({ frames: current, sequence }));
    if (message.kind === ViewerMessageKind.Failed) onFailed(sequence);
    if (message.kind === ViewerMessageKind.Exit) onExit();
  });
});

function registerFrame(sequence: number): (element: HTMLIFrameElement | null) => void {
  return function setFrameElement(element: HTMLIFrameElement | null): void {
    if (!element) {
      elements.current.delete(sequence);
      return;
    }
    elements.current.set(sequence, element);
  };
}
```

and the iframe reads `ref={registerFrame(frame.version.sequence)}`. `elements` stays a ref.

`version-view-page.tsx`: replace the message effect and the keydown effect with

```tsx
useWindowMessage((event) => {
  const message = readViewerMessage({ event, expectedSource: window.parent });
  if (message === null) return;
  if (message.kind === ViewerMessageKind.Highlight) setRuns(message.runs);
  if (message.kind === ViewerMessageKind.Clear) setRuns(NO_RUNS);
});
useEscapeKey({ isEnabled: true, onEscape: () => postToParent(ViewerMessageKind.Exit) });
```

and drop the `KeyboardKey` import.

- [ ] **Step 6: Run the gate.** Expected: PASS; `version-view-page.test.tsx` (highlights, foreign origin, Escape) and `time-travel.test.tsx` "the previous frame stays until the next one is ready and foreign messages are ignored", "a frame that reports a failure replaces the version with the failure message" and "Escape inside the version frame leaves the version and a foreign frame cannot" unchanged.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/lib/use-window-message.ts apps/web/src/lib/use-escape-key.ts apps/web/src/features/versions/version-frame.tsx apps/web/src/features/versions/version-view-page.tsx
git commit -m "refactor(web): listen for frame messages and Escape through two shared hooks"
```

---

### Task 11: Split `useTimeTravel`

Covers 2.2, 3.1, the time-travel half of 3.4, and top-10 item 3. The proof is `time-travel.test.tsx`, unchanged.

**Files:**
- Create: `apps/web/src/features/timeline/bin-containing.ts`, `apps/web/src/features/timeline/use-version-load.ts`
- Modify: `apps/web/src/features/timeline/use-time-travel.ts`
- Test: `apps/web/src/features/timeline/bin-containing.test.ts` (new)

**Interfaces:**
- Consumes: `useBinRuns` and `isTypingInField` (Task 1), `useEscapeKey` (Task 10), `pollWhileAvailable` (Task 8, inside `useBinRuns`).
- Produces: `type IndexedBin = { index: number; bin: TimelineBin }`, `binContaining({ timeline, time }: { timeline: DocumentTimeline | undefined; time: number | null }): IndexedBin | null`; `useVersionLoad({ documentId, sequence }: { documentId: string; sequence: number | null }): { version: VersionLoad | undefined; isError: boolean }`. `useTimeTravel` and `TimeTravel` keep their signatures (with Task 1's `shownVersion`).

- [ ] **Step 1: Write the failing test.** `bin-containing.test.ts`:

```ts
import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { binContaining } from './bin-containing';

const timeline = timelineWith({ volumes: [[1], [2], [3]], names: ['Budget'] });
const secondBin = timeline.bins[1]!;
const lastBin = timeline.bins[2]!;

test('a time inside a bin finds that bin and its index', () => {
  expect(binContaining({ timeline, time: secondBin.start + 1 })).toEqual({ index: 1, bin: secondBin });
  expect(binContaining({ timeline, time: secondBin.start })).toEqual({ index: 1, bin: secondBin });
});

test('a time outside every bin, no time or no timeline finds nothing', () => {
  expect(binContaining({ timeline, time: timeline.bins[0]!.start - 1 })).toBeNull();
  expect(binContaining({ timeline, time: lastBin.start + timeline.binMs })).toBeNull();
  expect(binContaining({ timeline, time: null })).toBeNull();
  expect(binContaining({ timeline: undefined, time: secondBin.start })).toBeNull();
});
```

Inert stub: `bin-containing.ts` exports `IndexedBin` and a `binContaining` returning `null`.

- [ ] **Step 2: Run it and see it fail.** `cd apps/web && npx vitest run src/features/timeline/bin-containing.test.ts`. Expected: FAIL on `expected null to deeply equal { index: 1, bin: … }`.

- [ ] **Step 3: Commit the red test.**

```bash
git add apps/web/src/features/timeline/bin-containing.ts apps/web/src/features/timeline/bin-containing.test.ts
git commit -m "test(web): pin the bin that contains a moment"
```

- [ ] **Step 4: Implement the two new units.**

`bin-containing.ts`:

```ts
import type { DocumentTimeline, TimelineBin } from '@superdoc-history/types';

export type IndexedBin = { index: number; bin: TimelineBin };

export function binContaining({ timeline, time }: { timeline: DocumentTimeline | undefined; time: number | null }): IndexedBin | null {
  if (!timeline || time === null) return null;
  const index = timeline.bins.findIndex((bin) => time >= bin.start && time < bin.start + timeline.binMs);
  if (index < 0) return null;
  return { index, bin: timeline.bins[index]! };
}
```

`use-version-load.ts`:

```ts
import { skipToken, useQuery } from '@tanstack/react-query';
import { fetchVersion, versionQueryKey, VersionLoadKind, type VersionLoad } from './timeline-api';

function retryWhilePending(query: { state: { data: VersionLoad | undefined } }): number | false {
  const data = query.state.data;
  if (data?.kind !== VersionLoadKind.Pending) return false;
  return data.retryAfterMs;
}

export function useVersionLoad({ documentId, sequence }: { documentId: string; sequence: number | null }): {
  version: VersionLoad | undefined;
  isError: boolean;
} {
  const { data, isError } = useQuery({
    queryKey: versionQueryKey({ documentId, sequence }),
    queryFn: sequence === null ? skipToken : () => fetchVersion({ documentId, sequence }),
    staleTime: (query) => (query.state.data?.kind === VersionLoadKind.Ready ? Infinity : 0),
    refetchInterval: retryWhilePending,
    retry: false,
  });
  return { version: data, isError };
}
```

- [ ] **Step 5: Rewrite `use-time-travel.ts`.** The whole file:

```ts
import { TimelineSearchParam, VersionViewerState, type EditRunView, type TimelineBin, type VersionSummary } from '@superdoc-history/types';
import { useEffect, useState } from 'react';
import { isTypingInField } from '@/lib/keyboard';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { useEscapeKey } from '@/lib/use-escape-key';
import { binContaining } from './bin-containing';
import { VersionLoadKind } from './timeline-api';
import { useBinRuns } from './use-bin-runs';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';
import { useVersionLoad } from './use-version-load';

export const SCRUB_DEBOUNCE_MS = 300;

type VersionPin = { at: number; sequence: number };

export type TimeTravel = {
  state: VersionViewerState;
  requestedBinStart: number | null;
  requestedBinEnd: number | null;
  requestedSequence: number | null;
  shownVersion: VersionSummary | null;
  isLoading: boolean;
  hasFailed: boolean;
  runs: EditRunView[];
  travelTo: (binStart: number) => void;
  backToLive: () => void;
  reportFailure: (sequence: number) => void;
};

function sequenceOf(bin: TimelineBin | undefined): number | null {
  if (!bin) return null;
  return bin.versionSequence;
}

function pinnedSequenceAt({ pin, at }: { pin: VersionPin | null; at: number | null }): number | null {
  if (pin === null || pin.at !== at) return null;
  return pin.sequence;
}

export function useTimeTravel({ documentId, isEnabled }: { documentId: string; isEnabled: boolean }): TimeTravel {
  const { search, update } = useTimelineSearch();
  const at = search.at;
  const [pendingBinStart, setPendingBinStart] = useState<number | null>(null);
  const [shownVersion, setShownVersion] = useState<VersionSummary | null>(null);
  const [failedFrameSequence, setFailedFrameSequence] = useState<number | null>(null);
  const [pinnedVersion, setPinnedVersion] = useState<VersionPin | null>(null);
  const state = at === null ? VersionViewerState.Live : VersionViewerState.Viewing;
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen: isEnabled && at !== null });
  const bin = binContaining({ timeline, time: at })?.bin;
  const binSequence = sequenceOf(bin);
  const requestedSequence = pinnedSequenceAt({ pin: pinnedVersion, at });
  const runs = useBinRuns({ documentId, timeline, bin, filter: search.filter });
  const { version, isError } = useVersionLoad({ documentId, sequence: requestedSequence });
  const hasFailedFrame = requestedSequence !== null && failedFrameSequence === requestedSequence;
  const hasFailed = version?.kind === VersionLoadKind.Failed || isError || hasFailedFrame;

  useEffect(() => {
    if (version?.kind === VersionLoadKind.Ready) setShownVersion(version.version);
  }, [version]);

  useEffect(() => {
    const isAlreadyPinned = pinnedSequenceAt({ pin: pinnedVersion, at }) !== null;
    const hasBinWithoutVersion = bin !== undefined && binSequence === null;
    if (at === null) {
      setPinnedVersion(null);
      setShownVersion(null);
      return;
    }
    if (isAlreadyPinned) return;
    if (hasBinWithoutVersion) {
      setShownVersion(null);
      return;
    }
    if (binSequence === null) return;
    setPinnedVersion({ at, sequence: binSequence });
  }, [at, bin, binSequence, pinnedVersion]);

  const { schedule, cancel } = useDebouncedCallback({
    callback: (binStart: number) => {
      update({ changes: { [TimelineSearchParam.At]: String(binStart) }, replace: state === VersionViewerState.Viewing });
      setPendingBinStart(null);
    },
    delayMs: SCRUB_DEBOUNCE_MS,
  });

  useEffect(() => {
    cancel();
    setPendingBinStart(null);
    setFailedFrameSequence(null);
  }, [at, cancel]);

  function travelTo(binStart: number): void {
    setPendingBinStart(binStart);
    schedule(binStart);
  }

  function backToLive(): void {
    cancel();
    setPendingBinStart(null);
    if (at === null) return;
    update({ changes: { [TimelineSearchParam.At]: null }, replace: false });
  }

  useEscapeKey({
    isEnabled: state === VersionViewerState.Viewing,
    onEscape: (event) => {
      if (isTypingInField(event.target)) return;
      backToLive();
    },
  });

  const requestedBinStart = pendingBinStart !== null ? pendingBinStart : at;
  const isShownFailed = shownVersion !== null && shownVersion.sequence === failedFrameSequence;

  return {
    state,
    requestedBinStart,
    requestedBinEnd: requestedBinStart !== null && timeline ? requestedBinStart + timeline.binMs : null,
    requestedSequence,
    shownVersion: at === null || isShownFailed ? null : shownVersion,
    isLoading: state === VersionViewerState.Viewing && !hasFailed && version?.kind !== VersionLoadKind.Ready,
    hasFailed,
    runs,
    travelTo,
    backToLive,
    reportFailure: setFailedFrameSequence,
  };
}
```

The pin effect keeps today's dependency list and today's four outcomes (live, already pinned, bin without a version, no bin yet), now as flat guards. `backToLiveRef` is gone because `useEscapeKey` calls the latest handler.

- [ ] **Step 6: Run the gate.** Expected: PASS with `time-travel.test.tsx`, `timeline-panel.test.tsx` and `document-page.test.tsx` unchanged (`git diff --stat HEAD -- '*.test.tsx'` is empty for this task). `rg -n "useQuery|addEventListener|backToLiveRef" apps/web/src/features/timeline/use-time-travel.ts` prints nothing.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/features/timeline/bin-containing.ts apps/web/src/features/timeline/use-version-load.ts apps/web/src/features/timeline/use-time-travel.ts
git commit -m "refactor(web): split time travel into bin lookup, version load and flat pin guards"
```

---

### Task 12: Split `TimelinePanel` with `useBinSelection`

Covers the bin-selection half of 2.3, 3.4 and top-10 item 9. The proof is `timeline-panel.test.tsx`, unchanged.

**Files:**
- Create: `apps/web/src/features/timeline/use-bin-selection.ts`
- Modify: `apps/web/src/features/timeline/timeline-panel.tsx`
- Test: `apps/web/src/features/timeline/use-bin-selection.test.ts` (new)

**Interfaces:**
- Consumes: `binContaining` (Task 11).
- Produces: `type BinSelection = { selectedIndex: number | null; selectedBin: TimelineBin | null; selectIndex: (index: number) => void; clearSelection: () => void }`; `useBinSelection({ timeline, at, onTravel, onBackToLive }: { timeline: DocumentTimeline | undefined; at: number | null; onTravel: (binStart: number) => void; onBackToLive: () => void }): BinSelection`.

- [ ] **Step 1: Write the failing test.** `use-bin-selection.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import type { DocumentTimeline } from '@superdoc-history/types';
import { expect, test, vi } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { useBinSelection } from './use-bin-selection';

const VERSION_SEQUENCE = 7;
const base = timelineWith({ volumes: [[1], [2], [3]], names: ['Budget'] });
const timeline: DocumentTimeline = {
  ...base,
  bins: base.bins.map((bin, index) => (index === 2 ? { ...bin, versionSequence: VERSION_SEQUENCE } : bin)),
};

function renderSelection(at: number | null) {
  const onTravel = vi.fn();
  const onBackToLive = vi.fn();
  const hook = renderHook((props: { at: number | null }) => useBinSelection({ timeline, at: props.at, onTravel, onBackToLive }), {
    initialProps: { at },
  });
  return { ...hook, onTravel, onBackToLive };
}

test('the selection starts at the moment in the URL and follows it', () => {
  const { result, rerender } = renderSelection(timeline.bins[1]!.start);
  expect(result.current.selectedIndex).toBe(1);
  expect(result.current.selectedBin).toEqual(timeline.bins[1]);
  rerender({ at: null });
  expect(result.current.selectedIndex).toBeNull();
  expect(result.current.selectedBin).toBeNull();
});

test('selecting a bin with a version travels to it, a bin without one only selects it', () => {
  const { result, onTravel } = renderSelection(null);
  act(() => result.current.selectIndex(0));
  expect(result.current.selectedIndex).toBe(0);
  expect(onTravel).not.toHaveBeenCalled();
  act(() => result.current.selectIndex(2));
  expect(result.current.selectedIndex).toBe(2);
  expect(onTravel).toHaveBeenCalledWith(timeline.bins[2]!.start);
});

test('clearing the selection goes back to live', () => {
  const { result, onBackToLive } = renderSelection(timeline.bins[1]!.start);
  act(() => result.current.clearSelection());
  expect(result.current.selectedIndex).toBeNull();
  expect(onBackToLive).toHaveBeenCalledTimes(1);
});
```

Inert stub: `use-bin-selection.ts` exports `BinSelection` and a `useBinSelection` returning `{ selectedIndex: null, selectedBin: null, selectIndex: () => undefined, clearSelection: () => undefined }`.

- [ ] **Step 2: Run it and see it fail.** `cd apps/web && npx vitest run src/features/timeline/use-bin-selection.test.ts`. Expected: FAIL on `expected null to be 1`, `expected null to be 0` and `expected "spy" to be called 1 times`.

- [ ] **Step 3: Commit the red test.**

```bash
git add apps/web/src/features/timeline/use-bin-selection.ts apps/web/src/features/timeline/use-bin-selection.test.ts
git commit -m "test(web): pin the timeline bin selection"
```

- [ ] **Step 4: Implement.** `use-bin-selection.ts`:

```ts
import type { DocumentTimeline, TimelineBin } from '@superdoc-history/types';
import { useEffect, useState } from 'react';
import { binContaining } from './bin-containing';

export type BinSelection = {
  selectedIndex: number | null;
  selectedBin: TimelineBin | null;
  selectIndex: (index: number) => void;
  clearSelection: () => void;
};

export function useBinSelection({
  timeline,
  at,
  onTravel,
  onBackToLive,
}: {
  timeline: DocumentTimeline | undefined;
  at: number | null;
  onTravel: (binStart: number) => void;
  onBackToLive: () => void;
}): BinSelection {
  const [selectedTime, setSelectedTime] = useState<number | null>(at);
  const selected = binContaining({ timeline, time: selectedTime });

  useEffect(() => {
    setSelectedTime(at);
  }, [at]);

  function selectIndex(index: number): void {
    const bin = timeline!.bins[index]!;
    setSelectedTime(bin.start);
    if (bin.versionSequence !== null) onTravel(bin.start);
  }

  function clearSelection(): void {
    setSelectedTime(null);
    onBackToLive();
  }

  if (selected === null) return { selectedIndex: null, selectedBin: null, selectIndex, clearSelection };
  return { selectedIndex: selected.index, selectedBin: selected.bin, selectIndex, clearSelection };
}
```

`selectIndex` keeps today's `timeline!`: the chart that calls it only renders with a timeline.

- [ ] **Step 5: Adopt in `timeline-panel.tsx`.** Delete `selectedTime` and its `useState`, the `selectedIndex` and `selectedBin` expressions, the `setSelectedTime(search.at)` effect, and `selectIndex` and `clearSelection`. After the `useTimeline` line add:

```tsx
const { selectedIndex, selectedBin, selectIndex, clearSelection } = useBinSelection({ timeline, at: search.at, onTravel, onBackToLive });
```

The selection reads `at: selectedBin ? selectedBin.start : null`, and the chart receives `selectedIndex={selectedIndex}`. `BinEdits` and `TopEdits` keep their `selectedBin &&` and `!selectedBin` conditions. Drop `useEffect` from the React import if nothing else uses it.

- [ ] **Step 6: Run the gate.** Expected: PASS with `timeline-panel.test.tsx` and `time-travel.test.tsx` unchanged. `rg -n "findIndex|selectedTime" apps/web/src/features/timeline/timeline-panel.tsx apps/web/src/features/timeline/use-time-travel.ts` prints nothing.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/features/timeline/use-bin-selection.ts apps/web/src/features/timeline/timeline-panel.tsx
git commit -m "refactor(web): move the panel's bin selection into its own hook"
```

---

### Task 13: `superdocOptions`

Covers 4.26.

**Files:**
- Create: `apps/web/src/features/editor/superdoc-options.ts`
- Modify: `apps/web/src/features/editor/superdoc-editor.tsx`, `apps/web/src/features/versions/version-viewer.tsx`
- Modify (import path only): `apps/web/src/features/editor/document-page.test.tsx`, `apps/web/src/features/versions/version-view-page.test.tsx`
- Test: `apps/web/src/features/editor/superdoc-options.test.ts` (new)

**Interfaces:**
- Consumes: `initialZoomMode()`, `ZoomMode` from `superdoc-zoom.ts` (lane A Task 7).
- Moves: `enum DocumentMode` from `superdoc-editor.tsx` into `superdoc-options.ts`, so the options file imports nothing from the component and there is no import cycle, not even a type-only one. Importers repoint: `superdoc-editor.tsx`, `version-viewer.tsx`, `document-page.test.tsx` and `version-view-page.test.tsx` (import path only).
- Produces: `superdocOptions({ container, documentId, file, documentMode, collaborationPath, roomMode, user }: { container: HTMLElement; documentId: string; file: Blob; documentMode: DocumentMode; collaborationPath: string; roomMode: RoomMode; user: SessionUser }): Config` (`Config` from `superdoc`).

- [ ] **Step 1: Write the failing test.** `superdoc-options.test.ts`:

```ts
import { COLLABORATION_TOKEN_PLACEHOLDER, DOCX_MIME_TYPE, RoomMode } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { SESSION_USER } from '@/testing/opened-document';
import { HOCUSPOCUS_PROVIDER } from './collaboration-config';
import { DocumentMode, superdocOptions } from './superdoc-options';
import { ZoomMode } from './superdoc-zoom';

const DOCUMENT_ID = 'doc-1';
const COLLABORATION_PATH = '/collaboration/doc-1';

test('the options open the file in its room as the signed-in user at the viewport zoom', () => {
  const container = document.createElement('div');
  const file = new Blob();
  const options = superdocOptions({
    container,
    documentId: DOCUMENT_ID,
    file,
    documentMode: DocumentMode.Viewing,
    collaborationPath: COLLABORATION_PATH,
    roomMode: RoomMode.Join,
    user: { ...SESSION_USER },
  });
  expect(options).toEqual({
    selector: container,
    documentMode: DocumentMode.Viewing,
    documents: [
      {
        id: DOCUMENT_ID,
        type: DOCX_MIME_TYPE,
        data: file,
        v2Collaboration: {
          providerType: HOCUSPOCUS_PROVIDER,
          documentId: DOCUMENT_ID,
          serverUrl: `ws://localhost:3000${COLLABORATION_PATH}`,
          roomMode: RoomMode.Join,
          token: COLLABORATION_TOKEN_PLACEHOLDER,
        },
      },
    ],
    user: SESSION_USER,
    zoom: { mode: ZoomMode.Manual },
  });
});
```

(`ws://localhost:3000` is jsdom's origin, as `version-view-page.test.tsx` already asserts; lane A's `matchMedia` double answers `matches: false`, hence `Manual`.) Inert stub: `superdoc-options.ts` exports the moved `DocumentMode` enum (final values, deleted from `superdoc-editor.tsx` with its importers repointed in this red commit) and `superdocOptions` returning `{} as Config`. Stage `superdoc-editor.tsx`, `version-viewer.tsx`, `document-page.test.tsx` and `version-view-page.test.tsx` with the red commit for that move.

- [ ] **Step 2: Run it and see it fail.** `cd apps/web && npx vitest run src/features/editor/superdoc-options.test.ts`. Expected: FAIL on `expected {} to deeply equal { selector: …`.

- [ ] **Step 3: Commit the red test.**

```bash
git add apps/web/src/features/editor/superdoc-options.ts apps/web/src/features/editor/superdoc-options.test.ts apps/web/src/features/editor/superdoc-editor.tsx apps/web/src/features/versions/version-viewer.tsx apps/web/src/features/editor/document-page.test.tsx apps/web/src/features/versions/version-view-page.test.tsx
git commit -m "test(web): pin the SuperDoc options shared by the editor and the viewer"
```

- [ ] **Step 4: Implement.** `superdoc-options.ts`:

```ts
import { COLLABORATION_TOKEN_PLACEHOLDER, DOCX_MIME_TYPE, type RoomMode, type SessionUser } from '@superdoc-history/types';
import type { Config } from 'superdoc';
import { collaborationUrl, HOCUSPOCUS_PROVIDER } from './collaboration-config';
import { initialZoomMode } from './superdoc-zoom';

export enum DocumentMode {
  Viewing = 'viewing',
  Editing = 'editing',
}

export function superdocOptions({
  container,
  documentId,
  file,
  documentMode,
  collaborationPath,
  roomMode,
  user,
}: {
  container: HTMLElement;
  documentId: string;
  file: Blob;
  documentMode: DocumentMode;
  collaborationPath: string;
  roomMode: RoomMode;
  user: SessionUser;
}): Config {
  return {
    selector: container,
    documentMode,
    documents: [
      {
        id: documentId,
        type: DOCX_MIME_TYPE,
        data: file,
        v2Collaboration: {
          providerType: HOCUSPOCUS_PROVIDER,
          documentId,
          serverUrl: collaborationUrl(collaborationPath),
          roomMode,
          token: COLLABORATION_TOKEN_PLACEHOLDER,
        },
      },
    ],
    user: { id: user.id, name: user.name, email: user.email },
    zoom: { mode: initialZoomMode() },
  };
}
```

`superdoc-editor.tsx`, in the effect:

```tsx
const superdoc = new SuperDoc({
  ...superdocOptions({
    container,
    documentId,
    file,
    documentMode: role === DocumentRole.Reader ? DocumentMode.Viewing : DocumentMode.Editing,
    collaborationPath: ApiPath.Collaboration,
    roomMode,
    user,
  }),
  onReady: ...lane A's handler, unchanged,
  onException: () => setHasFailed(true),
});
```

`version-viewer.tsx`, in the effect:

```tsx
const superdoc = new SuperDoc({
  ...superdocOptions({
    container,
    documentId,
    file: blank,
    documentMode: DocumentMode.Viewing,
    collaborationPath: versionCollaborationPath({ documentId, sequence }),
    roomMode: RoomMode.Join,
    user,
  }),
  onCollaborationReady: ...unchanged,
  onCollaborationConnectionChange: ...unchanged,
  onException: onFailed,
});
```

Both keep `followViewportZoom(superdoc)` and their cleanups as lane A left them. Drop the imports they no longer use (`COLLABORATION_TOKEN_PLACEHOLDER`, `DOCX_MIME_TYPE`, `collaborationUrl`, `HOCUSPOCUS_PROVIDER`, `initialZoomMode`). If `Config` rejects the spread because a callback type narrows a field, type the literal with `satisfies Config` at the call instead of a cast.

- [ ] **Step 5: Run the gate.** Expected: PASS; `document-page.test.tsx` ("creating fetches the stored download and a reader gets the viewing mode", "a cached create followed by a fresh join…", lane A's fit-width test) and `version-view-page.test.tsx` ("the frame page opens a read-only SuperDoc on the version endpoint…") unchanged.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/features/editor/superdoc-options.ts apps/web/src/features/editor/superdoc-editor.tsx apps/web/src/features/versions/version-viewer.tsx
git commit -m "refactor(web): build the SuperDoc options for the editor and the viewer in one place"
```

---

### Task 14: `ErrorMessage`

Covers 4.28.

**Files:**
- Create: `apps/web/src/components/error-message.tsx`
- Modify: `apps/web/src/features/documents/{documents-page.tsx,upload-dialog.tsx}`, `apps/web/src/features/timeline/{selection-summary-card.tsx,timeline-panel.tsx}`, `apps/web/src/features/editor/{share-dialog.tsx,superdoc-editor.tsx,editor-header.tsx,document-page.tsx}`, `apps/web/src/features/versions/version-view-page.tsx`
- Test: `apps/web/src/components/error-message.test.tsx` (new)

**Interfaces:**
- Produces: `ErrorMessage({ children, className }: { children: ReactNode; className?: string })`, rendering `<p role="alert" className={cn('text-sm text-destructive', className)}>`.

- [ ] **Step 1: Write the failing test.** `error-message.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ErrorMessage } from './error-message';

const MESSAGE = 'The document could not be loaded.';

test('an error message is announced as an alert', () => {
  render(<ErrorMessage>{MESSAGE}</ErrorMessage>);
  expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
});

test('an inset error message is still one alert with its text', () => {
  render(<ErrorMessage className="p-4">{MESSAGE}</ErrorMessage>);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
});
```

Inert stub: `error-message.tsx` exports an `ErrorMessage` that returns `null`.

- [ ] **Step 2: Run it and see it fail.** `cd apps/web && npx vitest run src/components/error-message.test.tsx`. Expected: FAIL on `Unable to find an accessible element with the role "alert"`.

- [ ] **Step 3: Commit the red test.**

```bash
git add apps/web/src/components/error-message.tsx apps/web/src/components/error-message.test.tsx
git commit -m "test(web): pin one error message component"
```

- [ ] **Step 4: Implement and adopt.** `components/error-message.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ErrorMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn('text-sm text-destructive', className)}>
      {children}
    </p>
  );
}
```

Replace each `<p role="alert" className="… text-sm text-destructive">{x}</p>` with `<ErrorMessage>{x}</ErrorMessage>`, moving any extra classes to `className` in the same order: `documents-page.tsx` (two), `upload-dialog.tsx`, `selection-summary-card.tsx`, `share-dialog.tsx` (`RESET_FAILED_MESSAGE`), `timeline-panel.tsx` (`refreshTopics.error.message`), `superdoc-editor.tsx` (`className="p-4"`), `editor-header.tsx` (two), `document-page.tsx` (`className="px-4 py-2"` and `className="flex-1 p-4"`), `version-view-page.tsx` (two, `className="p-4"`). The auth pages wait for Task 15. The unstyled `<p role="alert">` in `share-landing-page.tsx` and `unavailable-notice.tsx` keep their look and stay as they are.

Check: `rg -n 'role="alert" className="[^"]*text-destructive' apps/web/src --glob '!*.test.*'` prints only `components/error-message.tsx`, `sign-in-page.tsx` and `sign-up-page.tsx`.

- [ ] **Step 5: Run the gate.** Expected: PASS; every suite that finds an alert by role is unchanged.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/components/error-message.tsx apps/web/src/features/documents/documents-page.tsx apps/web/src/features/documents/upload-dialog.tsx apps/web/src/features/timeline/selection-summary-card.tsx apps/web/src/features/timeline/timeline-panel.tsx apps/web/src/features/editor/share-dialog.tsx apps/web/src/features/editor/superdoc-editor.tsx apps/web/src/features/editor/editor-header.tsx apps/web/src/features/editor/document-page.tsx apps/web/src/features/versions/version-view-page.tsx
git commit -m "refactor(web): render every inline error through one component"
```

---

### Task 15: `AuthCard` and `AuthTextField`

Covers 2.11 and top-10 item 10.

**Files:**
- Create: `apps/web/src/features/auth/auth-card.tsx`, `apps/web/src/features/auth/auth-text-field.tsx`
- Modify: `apps/web/src/features/auth/{sign-in-page.tsx,sign-up-page.tsx}`
- Test: `apps/web/src/features/auth/sign-up-page.test.tsx` (new, pinning), `apps/web/src/features/auth/auth-card.test.tsx` (new)

**Interfaces:**
- Consumes: `ErrorMessage` (Task 14); lane A Task 9's `auth-copy.ts` constants and `useDocumentTitle`.
- Produces:
  - `enum AuthFieldType { Text = 'text', Email = 'email', Password = 'password' }` and `AuthTextField<Values extends FieldValues>({ control, name, label, type, autoComplete }: { control: Control<Values>; name: FieldPath<Values>; label: string; type: AuthFieldType; autoComplete: string })`.
  - `AuthCard<Values extends FieldValues>({ form, onSubmit, title, description, submitLabel, pendingLabel, prompt, linkLabel, linkTo, children }: { form: UseFormReturn<Values>; onSubmit: (values: Values) => Promise<void>; title: string; description: string; submitLabel: string; pendingLabel: string; prompt: string; linkLabel: string; linkTo: AppRoute; children: ReactNode })`.

- [ ] **Step 1: Pin the sign-up page.** No sign-up test exists today. Create `sign-up-page.test.tsx`:

```tsx
import { AppRoute } from '@superdoc-history/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { authClient } from './auth-client';
import { EMAIL_FIELD_LABEL, NAME_FIELD_LABEL, PASSWORD_FIELD_LABEL, SIGN_IN_LABEL, SIGN_UP_HEADING, SIGN_UP_LABEL } from './auth-copy';
import { SignUpPage } from './sign-up-page';

vi.mock('./auth-client', () => ({ authClient: { signUp: { email: vi.fn() } } }));

const signUpEmail = vi.mocked(authClient.signUp.email);

beforeEach(() => signUpEmail.mockReset());

test('sign-up asks for a name, an email and a new password and links to sign-in', () => {
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  expect(screen.getByText(SIGN_UP_HEADING)).toBeInTheDocument();
  expect(screen.getByLabelText(NAME_FIELD_LABEL)).toHaveAttribute('autocomplete', 'name');
  expect(screen.getByLabelText(EMAIL_FIELD_LABEL)).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText(PASSWORD_FIELD_LABEL)).toHaveAttribute('autocomplete', 'new-password');
  expect(screen.getByRole('link', { name: SIGN_IN_LABEL })).toHaveAttribute('href', AppRoute.SignIn);
});

test('sign-up sends the three fields once', async () => {
  signUpEmail.mockResolvedValue({ data: null, error: null } as never);
  const user = userEvent.setup();
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  await user.type(screen.getByLabelText(NAME_FIELD_LABEL), 'Ada');
  await user.type(screen.getByLabelText(EMAIL_FIELD_LABEL), 'ada@example.com');
  await user.type(screen.getByLabelText(PASSWORD_FIELD_LABEL), 'long-enough-password');
  await user.click(screen.getByRole('button', { name: SIGN_UP_LABEL }));
  await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
  expect(signUpEmail.mock.calls[0]?.[0]).toEqual({ name: 'Ada', email: 'ada@example.com', password: 'long-enough-password' });
});
```

Run `cd apps/web && npx vitest run src/features/auth/sign-up-page.test.tsx`. Expected: PASS. (If `signUpSchema` normalises the values differently, assert what today's page sends; the pin records today.) Commit:

```bash
git add apps/web/src/features/auth/sign-up-page.test.tsx
git commit -m "test(web): pin the sign-up page"
```

- [ ] **Step 2: Write the failing test.** `auth-card.test.tsx`:

```tsx
import { AppRoute } from '@superdoc-history/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { AuthCard } from './auth-card';
import { AuthFieldType, AuthTextField } from './auth-text-field';

const ROOT_ERROR = 'Too many attempts. Try again in 30 seconds.';
const SUBMIT_LABEL = 'Sign in';

type ProbeValues = { email: string };

function Probe({ onSubmit, rootError }: { onSubmit: (values: ProbeValues) => Promise<void>; rootError: string | null }) {
  const form = useForm<ProbeValues>({ defaultValues: { email: '' } });

  useEffect(() => {
    if (rootError === null) return;
    form.setError('root', { message: rootError });
  }, [form, rootError]);

  return (
    <AuthCard
      form={form}
      onSubmit={onSubmit}
      title="Welcome"
      description="Use your email."
      submitLabel={SUBMIT_LABEL}
      pendingLabel="Signing in…"
      prompt="No account yet?"
      linkLabel="Sign up"
      linkTo={AppRoute.SignUp}
    >
      <AuthTextField control={form.control} name="email" label="Email" type={AuthFieldType.Email} autoComplete="email" />
    </AuthCard>
  );
}

test('the card titles the form, labels its field, submits its values and links onward', async () => {
  const onSubmit = vi.fn(async () => undefined);
  const user = userEvent.setup();
  renderWithProviders(<Probe onSubmit={onSubmit} rootError={null} />);
  expect(screen.getByText('Welcome')).toBeInTheDocument();
  expect(screen.getByText('Use your email.')).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveAttribute('type', AuthFieldType.Email);
  expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', AppRoute.SignUp);
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0]?.[0]).toEqual({ email: 'ada@example.com' });
});

test('a root error is announced as an alert', async () => {
  renderWithProviders(<Probe onSubmit={vi.fn(async () => undefined)} rootError={ROOT_ERROR} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(ROOT_ERROR);
});

test('while submitting the button shows the pending label and is disabled', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Probe onSubmit={() => new Promise<void>(() => undefined)} rootError={null} />);
  await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));
  expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
});
```

Inert stubs: `auth-card.tsx` exports an `AuthCard` that renders `<main />`; `auth-text-field.tsx` exports `AuthFieldType` (final values) and an `AuthTextField` that returns `null`.

- [ ] **Step 3: Run it and see it fail.** `cd apps/web && npx vitest run src/features/auth/auth-card.test.tsx`. Expected: FAIL on `Unable to find an element with the text: Welcome`, `Unable to find an accessible element with the role "alert"` and `Unable to find an accessible element with the role "button"`.

- [ ] **Step 4: Commit the red test.**

```bash
git add apps/web/src/features/auth/auth-card.tsx apps/web/src/features/auth/auth-text-field.tsx apps/web/src/features/auth/auth-card.test.tsx
git commit -m "test(web): pin the shared auth card and text field"
```

- [ ] **Step 5: Implement.** `auth-text-field.tsx`:

```tsx
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export enum AuthFieldType {
  Text = 'text',
  Email = 'email',
  Password = 'password',
}

export function AuthTextField<Values extends FieldValues>({
  control,
  name,
  label,
  type,
  autoComplete,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  type: AuthFieldType;
  autoComplete: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} autoComplete={autoComplete} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
```

`auth-card.tsx`:

```tsx
import type { AppRoute } from '@superdoc-history/types';
import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Link } from 'react-router';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';

type AuthCardProps<Values extends FieldValues> = {
  form: UseFormReturn<Values>;
  onSubmit: (values: Values) => Promise<void>;
  title: string;
  description: string;
  submitLabel: string;
  pendingLabel: string;
  prompt: string;
  linkLabel: string;
  linkTo: AppRoute;
  children: ReactNode;
};

export function AuthCard<Values extends FieldValues>({
  form,
  onSubmit,
  title,
  description,
  submitLabel,
  pendingLabel,
  prompt,
  linkLabel,
  linkTo,
  children,
}: AuthCardProps<Values>) {
  const rootError = form.formState.errors.root;
  const isSubmitting = form.formState.isSubmitting;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {children}
              {rootError && <ErrorMessage>{rootError.message}</ErrorMessage>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? pendingLabel : submitLabel}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {prompt}{' '}
                <Link to={linkTo} className="text-primary underline-offset-4 hover:underline">
                  {linkLabel}
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
```

`sign-in-page.tsx` (keeps lane A's `useDocumentTitle(SIGN_IN_LABEL)`):

```tsx
export function SignInPage() {
  const form = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });
  const submit = useAuthSubmit({ form, request: (values, responseCapture) => authClient.signIn.email(values, responseCapture) });
  useDocumentTitle(SIGN_IN_LABEL);

  return (
    <AuthCard
      form={form}
      onSubmit={submit}
      title={SIGN_IN_LABEL}
      description={SIGN_IN_DESCRIPTION}
      submitLabel={SIGN_IN_LABEL}
      pendingLabel={SIGN_IN_PENDING_LABEL}
      prompt={NO_ACCOUNT_PROMPT}
      linkLabel={SIGN_UP_LABEL}
      linkTo={AppRoute.SignUp}
    >
      <AuthTextField control={form.control} name="email" label={EMAIL_FIELD_LABEL} type={AuthFieldType.Email} autoComplete="email" />
      <AuthTextField
        control={form.control}
        name="password"
        label={PASSWORD_FIELD_LABEL}
        type={AuthFieldType.Password}
        autoComplete="current-password"
      />
    </AuthCard>
  );
}
```

`sign-up-page.tsx` the same with `SIGN_UP_HEADING`, `SIGN_UP_DESCRIPTION`, `SIGN_UP_LABEL`, `SIGN_UP_PENDING_LABEL`, `HAVE_ACCOUNT_PROMPT`, `SIGN_IN_LABEL`, `AppRoute.SignIn`, `useDocumentTitle(SIGN_UP_HEADING)`, and three fields: `name` (`NAME_FIELD_LABEL`, `AuthFieldType.Text`, `"name"`), `email` (`AuthFieldType.Email`, `"email"`), `password` (`AuthFieldType.Password`, `"new-password"`). Both pages drop the imports they no longer use. The rendered markup is identical to today's except that the name input now carries `type="text"`, which is the input default.

- [ ] **Step 6: Run the gate.** Expected: PASS; `sign-in-page.test.tsx` (including Task 1's 429 pin and lane A's title test), `sign-up-page.test.tsx`, `use-auth-submit.test.tsx` and `redirect-if-session.test.tsx` unchanged.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/features/auth/auth-card.tsx apps/web/src/features/auth/auth-text-field.tsx apps/web/src/features/auth/sign-in-page.tsx apps/web/src/features/auth/sign-up-page.tsx
git commit -m "refactor(web): build both auth pages from one card and one text field"
```

---

### Task 16: Upload message order and the download handler

Covers 3.14 and 3.15.

**Files:**
- Modify: `apps/web/src/features/documents/upload-dialog.tsx`, `apps/web/src/features/editor/{editor-header.tsx,document-page.tsx}`
- Test: `apps/web/src/features/documents/upload-dialog.test.tsx` (one pinning test), `apps/web/src/features/editor/editor-header.test.tsx` (`onDownload={null}` → `onDownload={undefined}`)

**Interfaces:**
- Produces: `EditorHeader`'s `onDownload: (() => void) | undefined` (was `| null`).

- [ ] **Step 1: Pin the upload message order.** Append to `upload-dialog.test.tsx`:

```tsx
test('a server failure shows its status and a rejected file afterwards shows only the rejection', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.InternalServerError }));
  renderWithProviders(<UploadDialog />);
  await chooseFile(docxFile({ name: 'plan.docx', size: 10 }));
  const serverFailure = requestFailedMessage({ subject: UPLOAD_SUBJECT, status: HttpStatus.InternalServerError });
  expect(await screen.findByRole('alert')).toHaveTextContent(serverFailure);
  await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText(FILE_INPUT_LABEL), new File(['x'], 'plan.pdf'));
  expect(screen.getByRole('alert')).toHaveTextContent(NOT_A_DOCX_MESSAGE);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});
```

(import `requestFailedMessage` from `@/lib/api` and `UPLOAD_SUBJECT` from `./documents-copy`). Run `cd apps/web && npx vitest run src/features/documents/upload-dialog.test.tsx`. Expected: PASS. Commit:

```bash
git add apps/web/src/features/documents/upload-dialog.test.tsx
git commit -m "test(web): pin which upload message wins"
```

- [ ] **Step 2: Implement the upload message.** In `upload-dialog.tsx`, above the component:

```tsx
function uploadErrorMessage({ validationMessage, error }: { validationMessage: string | null; error: Error | null }): string | null {
  if (validationMessage !== null) return validationMessage;
  if (error === null) return null;
  return error.message;
}
```

`const message = uploadErrorMessage({ validationMessage, error });` replaces the `||` line, and the JSX reads `{message !== null && <ErrorMessage>{message}</ErrorMessage>}`.

- [ ] **Step 3: Implement the download handler.** `editor-header.tsx`: the prop becomes `onDownload: (() => void) | undefined`, and the button reads `disabled={onDownload === undefined} onClick={onDownload}`. `document-page.tsx`: `onDownload={editorSetup ? downloadLiveDocument : undefined}`. In `editor-header.test.tsx`, every `onDownload={null}` becomes `onDownload={undefined}` (`rg -n "onDownload=\{null\}" apps/web/src` prints nothing afterwards).

- [ ] **Step 4: Run the gate.** Expected: PASS; `upload-dialog.test.tsx`, `editor-header.test.tsx` (download disabled for a header without a handler, enabled with one) and `document-page.test.tsx` "the header download exports the live document and a reader can use it" pass.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/documents/upload-dialog.tsx apps/web/src/features/editor/editor-header.tsx apps/web/src/features/editor/document-page.tsx apps/web/src/features/editor/editor-header.test.tsx
git commit -m "refactor(web): name which upload message wins and pass a missing download as undefined"
```

---

### Task 17: `jsonResponse` in the web tests

Covers the `jsonResponse` half of 4.33. Runs last, after every split has been proven against the suites unchanged.

**Files:**
- Create: `apps/web/src/testing/json-response.ts`
- Modify: every `apps/web/src/**/*.test.ts(x)` that contains `new Response(JSON.stringify(` (13 files before lane A; re-list with `rg -l`)

**Interfaces:**
- Produces: `jsonResponse({ body, status, headers }: { body: unknown; status?: number; headers?: HeadersInit }): Response` from `@/testing/json-response`.

- [ ] **Step 1: Create the helper.**

```ts
export function jsonResponse({ body, status, headers }: { body: unknown; status?: number; headers?: HeadersInit }): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
```

`status` and `headers` left `undefined` give `Response` its defaults (200, no headers), exactly as the two-argument constructor does today.

- [ ] **Step 2: Sweep.** `rg -l "new Response\(JSON\.stringify\(" apps/web/src`. In each file, `new Response(JSON.stringify(X))` → `jsonResponse({ body: X })`, `new Response(JSON.stringify(X), { status: S })` → `jsonResponse({ body: X, status: S })`, `new Response(JSON.stringify(X), { status: S, headers: H })` → `jsonResponse({ body: X, status: S, headers: H })`, and add `import { jsonResponse } from '@/testing/json-response';`. Keep `new Response(null, …)`, `new Response('{}', …)` and binary bodies as they are. Check: `rg -c "new Response\(JSON\.stringify\(" apps/web/src` prints nothing.

- [ ] **Step 3: Run the gate.** Expected: PASS with the same test count as before the sweep (`npx vitest run` prints the total; compare with Task 16's run).

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/testing/json-response.ts $(rg -l "jsonResponse" apps/web/src --glob '*.test.*')
git commit -m "test(web): build JSON responses in tests with one helper"
```

---

### Task 18: Lane gate

- [ ] **Step 1: Run every gate.**

```bash
pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:e2e
```

Expected: PASS. E2E specs are untouched by this lane, so any failure is a behaviour change: return to the task that owns the file.

- [ ] **Step 2: Check the audit leftovers are gone.**

```bash
rg -n "retryAfterSeconds|\bpinned\b|\.shown\b|canRefresh\b|'document-file'|NavigationKey|ResizeKey|failed with status \$" apps/web/src --glob '!*.test.*'
```

Expected: only `canRefresh` inside `timeline-notices.tsx` and as the prop passed to it, `retryAfterSeconds` inside `features/auth/` (the auth header stays a seconds string), `'document-file'` in `DOCUMENT_FILE_QUERY_KEY`'s declaration, and `requestFailedMessage` in `lib/api.ts`.

- [ ] **Step 3: Write the tester briefing** at `docs/features/refinement-readability-web/tester-briefing.md` (template in `docs/features/_template/tester-briefing.md`): the commit list per task, the red-then-green test commits, the pinning tests, and each "nothing visible changed" claim as a hypothesis. It also states:
  - `fetchDocuments` and `fetchMe` now throw `ApiRequestError` instead of a plain `Error`. The message is identical and no code or test checks the class.
  - Task 2's red commit fails only `pnpm --filter @superdoc-history/types typecheck` (TS2345); its Vitest run is green at red, because `presentOrNull(null)` already returns `null` at runtime.
  - Task 13 moved `DocumentMode` into `superdoc-options.ts` so the options file and `superdoc-editor.tsx` do not import each other; the two test files that import `DocumentMode` changed their import path only.
  - Tasks 6 and 13 edited existing test files: two `@/lib/api` mock factories (Task 6) and two `DocumentMode` import paths (Task 13).

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1.11 | `highlightUntilCancelled` changes when the cleanup runs, so highlights linger after the runs change | `use-run-highlights.test.ts` red on a `clearHighlights` call count | Revert the step; keep the aliases and only rename `document` to `editorDocument` |
| 2.4 | `presentOrNull` widened in `libs/types` breaks a server caller's inferred type | `pnpm typecheck` red in `apps/server` | The widening only adds `null` to the parameter; if a server site breaks, it passed a type that was already wrong, so fix that site |
| 5.2 | The `reduce` places labels in a different order than the old `map` | The inline snapshot from 5.1 goes red | Revert the task commit; the snapshot names the band whose label moved, so place labels in the same band order as the sorted `series` |
| 7.5 | A builder returns a different array and a query stops invalidating | `document-query-keys.test.ts` value pin red, or `timeline-panel.test.tsx` "Retry posts the refresh once and loads the timeline again" red | Restore the builder's literal spread for that key |
| 8.4 | A curried `pollWhileAvailable(...)` per render resets TanStack's interval timer | `use-selection-summary.test.ts` "a running summary is polled until it settles" times out | Hoist one module constant per interval (`const pollTimelineWhileAvailable = pollWhileAvailable(TIMELINE_POLL_MS)`) and pass that |
| 9.4 | The summary cooldown now resets a few hundred milliseconds earlier for a fractional header | `timeline-panel.test.tsx` "the summary cooldown message goes away when the cooldown ends" red | The server sends whole seconds; if a test sends a fraction, use a whole number there, it mirrors the server |
| 10.5 | Dropping `onFailedRef`/`onExitRef` makes the frame call a stale `onExit` | `time-travel.test.tsx` "Escape inside the version frame leaves the version…" red | `useWindowMessage` updates its ref after every render; if a test still fails, keep the two refs in `version-frame.tsx` and call them from the handler |
| 11.5 | The flattened pin effect pins a second time while a poll reports a newer version | `time-travel.test.tsx` "a poll that reports a newer version for the viewed period does not move the viewer" red | Restore today's effect body verbatim inside the new file and re-apply only the named booleans |
| 11.5 | `useEscapeKey` subscribes before the first render's handler is stored and Escape is lost on the first keypress | `time-travel.test.tsx` "Escape leaves the version from anywhere but a field being typed in" red | Initialise the ref with the handler (already done) and keep the subscribe effect after the ref effect, as written |
| 12.5 | The selection no longer resyncs when the URL moves back to live | `timeline-panel.test.tsx` or `time-travel.test.tsx` "an at link opens the version … and Back to live removes it" red | The hook keeps the `[at]` effect; check the panel passes `search.at`, not a copy |
| 13.4 | `Config` refuses the spread because a field type differs from the old inline literal | `pnpm typecheck` TS2345 on `new SuperDoc` | `satisfies Config` on the returned literal, never a cast |
| 15.5 | The generic `AuthCard` does not accept `form.handleSubmit(onSubmit)` for a zod-resolved form | `pnpm typecheck` red on `handleSubmit` | Type `onSubmit` as `SubmitHandler<Values>` from `react-hook-form` |
| 17.2 | A sweep changes a body from a string to JSON or drops a status | Test count unchanged but a suite red | Revert that file's sweep hunk |

**Steps with no backout:** none. Every step is a code change on a branch.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded (the auth pages, the panel and the editor page were rebuilt from new parts).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
