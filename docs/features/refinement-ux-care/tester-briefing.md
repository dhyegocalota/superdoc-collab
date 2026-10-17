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
| P2-13 blank document | `superdoc-editor.tsx`: muted backdrop with the page on the background colour; the caret is placed by the user's first click (see the follow-up below) |
| P3-11 fit to width | `superdoc-zoom.ts`: below `lg` the live editor and the version viewer start in SuperDoc `fit-width` and follow viewport changes; at `lg` and up they go back to 100%; the viewer measures the parent window, and `FITTED_PAGE_CLASS` keeps the scaled page at the left edge |
| P2-9 delete Cancel | `editor-header.tsx` delete dialog footer |
| P2-10 share dialog | `share-dialog.tsx`: "Reset link", description about the old link, two skeleton rows while loading, clipboard failure selects the input and says so, "Link copied" clears after 3 s |
| P2-17 copy | "…" in auth, editor and documents copy; four `libs/types` messages end with a period |
| P2-18 share landing | `share-landing-page.tsx`: "Opening…" centred in a `main` like the failure state |
| P3-3 auth copy | `auth-copy.ts` holds headings, descriptions, field labels and cross-link prompts |

E2E: `e2e/documents.spec.ts` deletes through the menu and expects the "Can edit" label in the shared row.

### How to run

```bash
pnpm --filter @superdoc-collab/web exec vitest run
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
- The browser tab reads "Plan · SuperDoc Collab" on a document, "Documents · SuperDoc Collab" on the list, and "Sign in" or "Create your account" on the auth pages.
- Opening a document shows the header with a title skeleton and "Loading document…" instead of a grey screen.
- The current user's avatar shows the green dot at once; a screen reader announces "Ana, online".
- The documents page shows three skeleton rows while loading, then the lists; Shared shows "Can edit" or "Can view", never the raw role.
- At 375 the Shared table shows only Title and Access and nothing clips.
- During an upload the file input is disabled and "Uploading…" shows.
- A failed "New document" shows its alert on its own line under the Mine heading.
- "New document" opens a page on a muted backdrop; nothing takes the focus until the user clicks the page, and typing after that click lands in the document.
- Below `lg` the page fits the width in the live editor and in the version viewer, starting at the left edge with no sideways scroll; resizing across `lg` switches both ways.
- Share dialog: "Reset link" buttons; the description says resetting stops the old link; on an insecure origin Copy selects the link and says to copy with the keyboard; "Link copied" disappears after about 3 s.
- `/share/<token>` shows "Opening…" centred while it resolves.

### Known gaps

- E2E was not run on this branch: port 3100 was held by another agent's server, and `playwright.config.ts` does not reuse an existing server.
- Pure styling (backdrop, column hiding, icon-only buttons) has no unit assertion by design; screenshots must prove it.
- `editor-copy.ts` imports `APP_NAME` by relative path, because the E2E typecheck reads copy files without the `@/` alias.

## Follow-up after the screens tester (fix/ux-fit-width)

### Blank document focus (P2-13), plan B

The tester found that a new document crashed on its first key: "The editor stopped working. Reload the page to continue." It reproduced 3 of 3 in a throwaway Playwright spec.

SuperDoc 2.23.0 reports "This edit couldn't be completed. Adjust the selection and try again." A programmatic `focus()` puts the caret in its composition textarea with no document selection, and the first key throws. Focusing from `onCollaborationReady` instead of `onReady` fails the same way.

The automatic focus was removed in ebf9355, together with the router state that only fed it. The backdrop stays. The caret is placed by the user's first click. The unit test now pins that the editor config has no `onReady` focus.

### Fit to width at 375 (P3-11)

The tester found the scaled page drawn 220 px from the left of a 375 px editor, with the right side clipped behind a sideways scroll.

SuperDoc's `.superdoc` root is a flex container. Its layers child kept the page's 816 px minimum width. SuperDoc scales its layout box from the top left and widens it to keep the page centred, so the page sat in the middle of 816 px instead of 375 px. The offset is exactly (816 − 375) / 2.

The fix is `FITTED_PAGE_CLASS` on both SuperDoc hosts, in 21e62d7. The flex children of `.superdoc` may shrink, and the page uses safe centring. When the page is wider than the column, as at 100% on a 1280 screen, it starts at the left edge and scrolls instead of clipping.

Tailwind turns underscores in arbitrary variants into spaces, and escaped underscores were read literally. So the class targets `.superdoc>*` rather than `.superdoc__layers`.

Measured with a throwaway Playwright probe on the built bundle, offsets relative to the editor container:

| Width | Page left | Page width | Container width | Scroll width |
|-------|-----------|------------|-----------------|--------------|
| 375 before | 220 | 375 | 375 | 816 |
| 375 after | 0 | 375 | 375 | 375 |
| 1280 after | 0 | 816 | 768 | 816 |

The 1280 row is unchanged from before the fix.

Screenshots: `fit-after-375.png` and `fit-after-1280.png` in the session scratchpad, next to the tester's `fit-375-fresh`.

New E2E in `e2e/documents.spec.ts` (634a3f9): "on a narrow viewport the page starts at the left edge and the editor never scrolls sideways". Its red state was shown by the probe on the pre-fix build, not by running the spec itself. It has not been run since the fix; the CI `e2e.yml` run is the proof. The version viewer at 375 was not probed.
