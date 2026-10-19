# Test plan: Welcoming surfaces

## The failing test first

- [ ] `documents-empty-state.test.tsx::shows the empty state when both lists are empty` — expected: the heading and the drop zone
- [ ] Confirmed it fails for the right reason: <paste>

## Unit

- [ ] `auth-layout.test.tsx`: panel with tagline and value lines; About link; the card's content rendered
- [ ] `history-illustration.test.tsx`: `aria-hidden`, no title, author token classes
- [ ] `upload-drop-zone.test.tsx`: file input keeps `Document file`; uploading state; error under the zone
- [ ] `upload-drop-overlay.test.tsx`: shows on a `Files` drag only; survives dragleave to a child; two files → message; non-DOCX → message

## E2E

- [ ] `e2e/documents.spec.ts::a fresh user sees the empty state and it disappears after New document`
- [ ] `e2e/documents.spec.ts::dropping the brief on the page uploads it`
- [ ] `e2e/auth.spec.ts` and `e2e/admin.spec.ts` (invite sign-up) stay green

## Prove it for real — Playwright MCP

- [ ] Sign in at 1280 and 375, light and dark: screenshots
- [ ] Empty documents page at 1280 and 375: screenshots; drag a file over the page → overlay; drop → document opens
- [ ] Console and network clean

## Adversarial review

- [ ] Claim 1: the auth card behaviour is unchanged — attack: diff the card's rendered roles before and after; result:
- [ ] Claim 2: the overlay never sticks — attack: drag in, press Escape, move out; result:
- [ ] Claim 3: no raster image was added — attack: list apps/web/src for png/jpg; result:

## Coverage honesty

- Safari drag events are not exercised.
