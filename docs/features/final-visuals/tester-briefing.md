# Tester briefing: <Feature title>

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- <file or module> — <one line>

## How to run

```bash
<commands to start the stack and open the feature>
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `<path>::<name>` |  |  |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: <claim>. Break it by: <suggested attack>.

## Known gaps

- <what the developer knows is missing or untested>

## G6 waiting page (developer-6)

### What changed

- `libs/types/src/constants.ts`: `DOCUMENT_READY_POLL_MS` (2 s) and `DOCUMENT_READY_GIVE_UP_MS` (5 min), a mirror of G1; the lead keeps G1's version at merge.
- `apps/web/src/features/editor/editor-api.ts`: `DocumentNotReadyError`. `openDocument` throws it on 409 `NOT_READY` and throws `DocumentUnavailableError` on 404.
- `apps/web/src/features/editor/use-opened-document.ts`: returns `{ data, error, isFetchedAfterMount, readiness, keepWaiting, retry }`. `DocumentReadiness` is `Opening`, `Ready`, `Waiting`, `Paused`, `Failed`, `Unavailable`. `error` is `null` while waiting or paused. The give-up counts answers (150), so hidden time never counts.
- `apps/web/src/features/editor/waiting-for-document.tsx` and `waiting-copy.ts`: the page and its copy.
- Step 50 is pending: `unavailable-notice.tsx` and `DOCUMENT_NOT_READY_MESSAGE` stay until G2 and G8 stop importing them.

### Integration G2 must do in `document-page.tsx`

1. Read `readiness`, `keepWaiting` and `retry` from `useOpenedDocument`.
2. Replace both `UnavailableNotice` returns with one early return when the readiness is `Waiting`, `Paused`, `Failed` or `Unavailable` (`isUnavailable` from `useMembers` maps to `Unavailable`): `<WaitingForDocument documentId={documentId} readiness={readiness} onKeepWaiting={keepWaiting} onRetry={retry} />`. `Opening` keeps rendering `OpeningDocument`.
3. In `waiting-for-document.tsx`, the `<header>` (brand link plus title or skeleton) is a placeholder made of `HomeLink`. Swap the whole header element for `AppTopBar` in one line; keep the title branch (cached title, else `Skeleton`) as `AppTopBar`'s title slot.
4. `document-page.test.tsx::a 409 not ready shows the owner message and never builds the editor` is red until step 2 lands: the hook no longer returns an error for 409. G2 rewrites it to expect the waiting card. `e2e/documents.spec.ts` line 91 waits for `DOCUMENT_NOT_READY_MESSAGE` and is G8's to move to `PREPARING_DOCUMENT_MESSAGE`.
5. After that, delete `unavailable-notice.tsx` and `DOCUMENT_NOT_READY_MESSAGE` (step 50); `DocumentNotReadyError` already uses `DOCUMENT_NOT_READY_ERROR` as its message.

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `editor-api.test.ts::a 409 NOT_READY throws DocumentNotReadyError, not a generic error` (`1fb396c`) | `expected Error: The owner has not opened this docu… to be an instance of DocumentNotReadyError` | `5e50263` throws the typed error |
| `editor-api.test.ts::the open request targets the document path` | pin, green when it landed | |
| `use-opened-document.test.tsx::a NOT_READY answer is a state that polls every 2 s and enters on 200` (`26f67bd`) | `expected 'ready' to be 'waiting'` | `ffa5adb` |
| `…::after 150 polls the state is paused, and ten minutes hidden with zero polls keeps it waiting` | `expected 'ready' to be 'paused'` | `ffa5adb` |
| `…::ten minutes hidden with zero polls keeps it waiting` | `expected 'ready' to be 'waiting'` | `ffa5adb` |
| `…::keepWaiting restarts the count` | `expected 'ready' to be 'paused'` | `ffa5adb` |
| `…::a non-409 error stays an error and retry refetches once` | `expected 'ready' to be 'failed'` | `ffa5adb` |
| `…::a 404 is unavailable, not a failure to retry` | `expected 'ready' to be 'unavailable'` | `ffa5adb` |
| `waiting-for-document.test.tsx` (6 tests, `c2a914d`) | the stub threw `WaitingForDocument is not implemented`, so each query found the router error page ("Unexpected Application Error!") | `9dbb452` |

### Hypotheses to attack

1. Hypothesis: a document opened before its owner's first sync shows the waiting card and enters on its own within about 2 s of the owner opening it. Break it by: opening as a reader first, then the owner; also reload while waiting.
2. Hypothesis: polling stops after 150 answers (5 minutes of visible waiting) and a hidden tab never polls. Break it by: leaving the tab hidden for 6 minutes, then showing it; the card must still say "Preparing the document…".
3. Hypothesis: "Keep waiting" resumes polling at once and gives another 5 minutes. Break it by: clicking it twice quickly; clicking it after the owner has opened the document.
4. Hypothesis: a 500 or a dropped connection shows "Try again", which refetches once and does not poll. Break it by: going offline while waiting, then back online and clicking Try again.
5. Hypothesis: the card is never wider than the viewport minus 32 px and the page has no horizontal scroll from 320 to 2560 px; the card sits 120 px from the canvas top, 64 px below 640 px. Break it by: resizing through 320, 375, 639, 640, 1280 and 2560, in light and dark.
6. Hypothesis: the card text is announced once (`role="status"`; the error card uses `role="alert"`) and polling never re-renders it. Break it by: a screen reader pass while waiting for a minute.
7. Hypothesis: the title shows only when the documents list cache already holds the document (opened from the list), and a skeleton shows when entering by a share link or a reload. Break it by: both entries.

### Known gaps

- The first answer counts as one of the 150, so the card pauses 148 intervals (about 4 minutes 56 seconds) after the first answer. After "Keep waiting" the count restarts from the refetch it triggers.
- The title is read once per render from the cache with `getQueryData`; it does not subscribe, so a title that arrives while the card is up appears at the next render.
- The header is a placeholder until G2 swaps in `AppTopBar`; the account menu is absent until then.
- The use-opened-document tests settle fake timers with a 100 ms advance after each step; changing TanStack's notify scheduling could need a bigger value.
- No test measures layout (widths, 120 px and 64 px offsets); those need the browser walk.
