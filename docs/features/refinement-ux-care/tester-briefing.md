# Tester briefing: refinement-ux-care

## Screens group (Tasks 5–9)

Branch `chore/refinement-ux-screens`, cut from the lane after Task 1, now holding the whole lane (PR #14). Audit screenshots to compare against: `/private/tmp/claude-501/-Users-dhyegocalota-Projects-superdoc-take-home/4e1bb842-4c6e-4cb5-b154-ebb9b96b46e8/scratchpad/audit-ux/`.

### What changed and where

| Audit item | Where |
|------------|-------|
| P1-1 home link | `apps/web/src/features/editor/home-link.tsx`, first in `editor-header.tsx` and in the opening state of `document-page.tsx` |
| P2-5 page titles | `useDocumentTitle` in `document-page.tsx`, `documents-page.tsx`, `sign-in-page.tsx`, `sign-up-page.tsx`; documents page gains the app name and a "Documents" h1 |
| P2-6 waits | `document-list-skeleton.tsx` on the documents page; `OpeningDocument` in `document-page.tsx` keeps the header while the document opens |
| P2-16 presence | `members.tsx`: green dot (`bg-online`), screen-reader label "Ana, online", the current user online at once |
| P2-3, P2-4 table | `document-columns.ts`, `document-table.tsx`: Mine shows Title and Updated; Shared shows Title, Owner, Updated, Access; Owner and Updated hide below `sm` |
| P2-7 upload wait | `upload-dialog.tsx`: input disabled and "Uploading…" status while the request runs |
| P2-8 create error | `documents-page.tsx`: the alert sits under the Mine heading, outside the button row (`use-create-document.ts` holds the mutation) |
| P2-2 / P3-5 phone header | `editor-header.tsx`: Download and Share are icon buttons below `sm`; Delete moved into a "More actions" menu (owner only) at every width |
| P2-13 blank document | `superdoc-editor.tsx`: muted backdrop with the page on the background colour; a document made with "New document" gets the caret on ready (router state from `new-document-state.ts`) |
| P3-11 fit to width | `superdoc-zoom.ts`: below `lg` the live editor and the version viewer start in SuperDoc `fit-width` and follow viewport changes; at `lg` and up they go back to 100% |
| P2-9 delete Cancel | `editor-header.tsx` delete dialog footer |
| P2-10 share dialog | `share-dialog.tsx`: "Reset link", description about the old link, two skeleton rows while loading, clipboard failure selects the input and says so, "Link copied" clears after 3 s |
| P2-17 copy | "…" in auth, editor and documents copy; four `libs/types` messages end with a period |
| P2-18 share landing | `share-landing-page.tsx`: "Opening…" centred in a `main` like the failure state |
| P3-3 auth copy | `auth-copy.ts` holds headings, descriptions, field labels and cross-link prompts |

E2E: `e2e/documents.spec.ts` deletes through the menu and expects the "Can edit" label in the shared row.

### How to run

```bash
pnpm --filter @superdoc-history/web exec vitest run
pnpm typecheck
pnpm test:e2e
```

### Red then green

Each pair is a `test(web): …` commit followed by its `fix(web…): …` commit.

| Task | Red commit | Green commit | Red tests |
|------|-----------|--------------|-----------|
| 5 | bb2cb9b | 64dfd80 | 4 |
| 6 | d06cb61 | 3cc560f | 5 |
| 7 | 0746356 | 4c8e966 | 8 |
| 8 | bbcb0d8 | 228197c | 6 |
| 9 | 4b65836 | 9b582c1 | 9 |

`chore/refinement-ux-care` (Tasks 2–4) was merged into this branch in d412020 with no conflict. After the merge every unit test is green.

| Suite | Result |
|-------|--------|
| web | 272 passed |
| server | 382 passed, 1 failed |

The server failure is the timeline-routes latency budget: 193 ms against 150 ms, measured while the machine load average was about 10. No change in this group touches that path; rerun it on an idle machine.

### Hypotheses for the tester

- At 1280 and 375 the editor header starts with an arrow link; the app name shows from `sm` up; clicking it opens the documents list.
- At 375 the editor header takes at most two rows and the page does not scroll sideways.
- The "More actions" menu opens with mouse and keyboard; Delete opens the confirm dialog; Cancel closes it and the header stays clickable.
- A reader sees no "More actions" button.
- The browser tab reads "Plan · SuperDoc History" on a document, "Documents · SuperDoc History" on the list, and "Sign in" or "Create your account" on the auth pages.
- Opening a document shows the header with a title skeleton and "Loading document…" instead of a grey screen.
- The current user's avatar shows the green dot at once; a screen reader announces "Ana, online".
- The documents page shows three skeleton rows while loading, then the lists; Shared shows "Can edit" or "Can view", never the raw role.
- At 375 the Shared table shows only Title and Access and nothing clips.
- During an upload the file input is disabled and "Uploading…" shows.
- A failed "New document" shows its alert on its own line under the Mine heading.
- "New document" opens a page on a muted backdrop with the caret in it; opening an existing document never takes focus.
- Below `lg` the page fits the width in the live editor and in the version viewer; resizing across `lg` switches both ways.
- Share dialog: "Reset link" buttons; the description says resetting stops the old link; on an insecure origin Copy selects the link and says to copy with the keyboard; "Link copied" disappears after about 3 s.
- `/share/<token>` shows "Opening…" centred while it resolves.

### Known gaps

- E2E was not run on this branch: port 3100 was held by another agent's server, and `playwright.config.ts` does not reuse an existing server.
- Pure styling (backdrop, column hiding, icon-only buttons) has no unit assertion by design; screenshots must prove it.
- `editor-copy.ts` imports `APP_NAME` by relative path, because the E2E typecheck reads copy files without the `@/` alias.
