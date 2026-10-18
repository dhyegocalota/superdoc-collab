# Test plan: One colour per member of a document

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `libs/types/src/author-colors.test.ts::two members whose ids hash to one slot get two slots in join order` — input: two ids with the same `authorColorSlot`; expected: the first keeps its hash slot, the second gets the next free slot
- [ ] Confirmed it fails for the right reason: `assignAuthorColorSlots is not implemented`

## Unit

- [ ] `author-colors.test.ts::six members get six distinct slots` — input: six ids; expected: the set of slots has size 6
- [ ] `author-colors.test.ts::the seventh member takes its hash slot` — input: seven ids; expected: the seventh's slot equals `authorColorSlot(id)`
- [ ] `author-colors.test.ts::an empty list is an empty map` — input: `[]`; expected: size 0
- [ ] Server route test: the members response carries `colorSlot` per member — input: six random members; expected: a set of six distinct slots
- [ ] Server route test: each open answer carries that user's members-response slot — input: six members open a committed room; expected: six distinct slots equal to the members response
- [ ] `author-colors.test.ts::a collision on slot six wraps to slot one` — input: two ids hashing to slot 6; expected: `[6, 1]`
- [ ] `superdoc-editor.test.tsx` and `version-viewer.test.tsx`: the user colour comes from the passed slot — input: slot 2; expected: `user.color` is the resolved hex `#5a2eb8` of `testing/author-palette.ts`
- [ ] `use-author-color-slots.test.ts` and `contributor-avatars.test.tsx`: members not answered yet — expected: no resolver and a `bg-muted` swatch, no `bg-author-N` class
- [ ] `use-author-color-slots.test.ts`: a member resolves to its response slot; a non-member author resolves to the hash of its key; an agent author resolves to its person's slot
- [ ] `members.test.tsx`, `use-member-cursors.test.ts`, `contributor-avatars.test.tsx`, `version-viewer.test.tsx`: the colour comes from `colorSlot`, not from the id hash — input: a member with `colorSlot` different from its hash; expected: the response slot wins
- [ ] `pnpm --filter @superdoc-collab/types test:unit`, `pnpm --filter @superdoc-collab/server test:unit`, `pnpm --filter @superdoc-collab/web test:unit`; expected: green

## E2E (Playwright specs)

- [ ] The consistency proof (demo ids are random per database, so distinctness is not asserted) — steps: Ana creates a document, shares it, Bruno joins, both type; expected: each swatch class equals the members-response slot, Ana's swatch is the same in both browsers, and each remote caret colour equals that member's swatch colour

## Prove it for real — Playwright MCP

- [ ] Happy path with three members (ana, bruno, caio, one browser each): expected: three different colours in every members list and on every remote cursor, and the timeline avatars match the members list
- [ ] Single member: expected: the own colour is the hash slot (nothing to displace)
- [ ] Imported author (a DOCX generated with `buildSeedDocx` and a tracked change authored by "Chris Crawford"): expected: the timeline shows the hash colour of `imported:chris crawford` and no error
- [ ] A member removed (no removal flow exists, so a direct SQLite delete of bruno's `document_members` row, marked simulated): expected: caio keeps a colour distinct from ana; note any shift
- [ ] Console and network clean: zero console errors, zero failed requests
- [ ] Desktop 1280 and narrow 375: expected: swatches visible, nothing overflows
- [ ] Screenshots at `.pr-media/author-colours/`; video at `.pr-media/author-colours/walkthrough.mp4`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the own cursor colour at mount equals the colour others see — attack: compare the SuperDoc `user.color` with the members response slot; result:
- [ ] Claim 2: no reader of a colour still hashes a member id — attack: grep `authorColorSlot(` in apps/web; result:
- [ ] Claim 3: the open route's member load does not run on the 409 path — attack: read the route order; result:

## Coverage honesty

What is not tested and why.

- The colour shift when a displacing member leaves is observed in the walk, not asserted: ADR 0037 accepts it.
- Cursor jump matches carets by name plus colour; after a shift or with an old tab it says not found until the peer remounts. Not asserted.
- The selection summary card colours an author with no id in the timeline by the imported hash, even if that person is a member.
