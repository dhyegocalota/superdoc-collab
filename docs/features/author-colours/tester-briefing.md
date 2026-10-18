# Tester briefing: One colour per member of a document

## What changed

- `libs/types/src/author-colors.ts`: `assignAuthorColorSlots({ memberIds })` gives each member in join order its hash slot when free, otherwise the next free slot cyclically; from the seventh member the hash slot applies.
- `libs/types/src/documents.ts`: `DocumentMember.colorSlot` and `OpenedDocument.colorSlot`.
- `apps/server/src/documents/documents-repository.ts`: `membersWithColorSlots` and `colorSlotOf`; members now also order by user id when `joinedAt` ties, so every client gets one order.
- `apps/server/src/documents/documents-routes.ts`: the members route returns `colorSlot` per member; the open route returns the current user's `colorSlot` only on its 200 paths (Join and the creator's Create), after the role and reservation checks. The 409 and 429 paths do not load members.
- Web: `authorPaletteOf({ colorSlot })` replaces the id hash; the slot travels open answer, editor setup, `SuperDocEditor` and `VersionViewer` (via `version-view-page.tsx`). `members.tsx` and `use-member-cursors.ts` read `member.colorSlot`. `AuthorAvatar` resolves through the new `useAuthorColorSlots()` (timeline), which reads `documentId` from the route and `useMembers`, looks the member up by `authorColorKeyOf` and hashes only for a non-member. It returns null until the members have data, and `UserAvatar` then renders a neutral `bg-muted` swatch.
- E2E: one test in `e2e/final-visuals.spec.ts`.

## Files outside the plan's G1 list that I touched

`use-editor-setup.ts` (+ its test), `document-page.tsx`, `version-view-page.tsx`, `editor-header.test.tsx` and `selection-summary-card.test.tsx` (fixtures and a hook mock). Each is a one-line plumbing or fixture change; the lead was told.

## Deviation from the spec

`useAuthorColorSlots()` takes no argument and reads `documentId` from the route, because `AuthorAvatar` is rendered by `TopEdits` and `SelectionSummaryCard`, which have no document id. The version viewer renders no authors and takes `opened.colorSlot` directly, so it is not a reader of the hook.

## How to run

```
pnpm --filter @superdoc-collab/types exec vitest run src/author-colors.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/documents/documents-routes.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline src/features/editor src/features/versions
pnpm typecheck
```

## Red today, green after

| Commit (red) | Test | Failure printed |
|---|---|---|
| 3213a32 | `author-colors.test.ts` four `assignAuthorColorSlots` tests | `Error: assignAuthorColorSlots is not implemented` |
| fc78a7b | `documents-routes.test.ts::members carry a distinct colorSlot per member for the first six members` | `AssertionError: expected 1 to be 6` |
| fc78a7b | `documents-routes.test.ts::open answers the colorSlot the members route gives the same user` | `AssertionError: expected 1 to be 6` (the test was then fixed in d36b730 to commit the room first and compare by user id) |
| 206f995 | `superdoc-editor.test.tsx::passes the colour of the slot the server assigned...` | `AssertionError: expected '#b82e70' to be '#5a2eb8'` |
| 206f995 | `version-viewer.test.tsx::the viewer user carries the colour of the slot...` | `AssertionError: expected '#b82e70' to be '#5a2eb8'` |
| e9f99f3 | `members.test.tsx` (5 failures) and `use-member-cursors.test.ts` (8 failures) | `AssertionError: expected 'not-found' to be 'jumped'`, `expected false to be true`, `expected [ '', '' ] to deeply equal [ '#b82ea8', '#b82ea8' ]` |
| 7eddfa6 | `use-author-color-slots.test.ts::before the members answer there is no resolver...` and `contributor-avatars.test.tsx::before the members answer an avatar is neutral...` | `AssertionError: expected [Function] to be null`; `expected element to have class bg-muted` |
| 43eb812 | `use-author-color-slots.test.ts` (3) and `contributor-avatars.test.tsx::an author who is a member takes the slot the server assigned` | `Error: useAuthorColorSlots is not implemented`; `expected element to have class bg-author-6` |

Pins (green when they landed): `author-colors.test.ts::a collision on slot six wraps to slot one`, `use-editor-setup.test.ts::pin: the setup captures the colour slot of the open answer`.

Known blemish: the red commit e9f99f3 does not typecheck (two untyped fixtures in `members.test.tsx`); 3719906 fixes it. The red commit 752d207 repaired a typecheck error left by 3213a32.

## Hypotheses for the tester

- Ana, Bruno and Caio on one document see three different swatches and three different remote cursor colours, identical on every browser.
- The own cursor colour at mount equals the swatch the others show for that user, before the members poll answers.
- A single member keeps the hash slot.
- An imported author (null id) in the timeline shows the hash colour of `imported:<name>` with no error.
- A member removed after a displacing member joined: the displaced member's colour may shift (accepted by ADR 0037).
- Opening a document that is still being prepared (409) and rate limiting (429) are unchanged and do not load members.

## Gaps

- The E2E test (`two members have two colours, one on every surface and on every browser`) was typechecked but never run by me. It asserts distinctness too: with exactly two members the second always takes a free slot, whatever the random ids.
- Cursor jump matches carets by name plus colour: after a slot shift or with an old tab it says not found until the peer remounts. I kept the matching; name-only matching would confuse same-name members.
- The selection summary card colours an author with no id in the timeline by the imported hash.
- The server unit tests use random user ids, so they assert six distinct slots for six members rather than a forced collision; a forced collision is covered by the pure function test.
- The own SuperDoc cursor colour cannot be read from the page; the E2E compares swatches and remote carets only.
- The account menu avatar takes the document slot on the document page (`AccountMenu colorSlot={opened.colorSlot}`) and keeps the hash colour on every other page (`colorSlot={null}`).
- I did not run the whole web or server suites, only the directories named above.
