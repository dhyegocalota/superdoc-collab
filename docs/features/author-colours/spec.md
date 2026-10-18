# One colour per member of a document

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-18 ("fix tambem colisao de cores entre diferentes usuarios no mesmo doc")
**ADRs:** [0037](../../adr/0037-author-colour-slots-are-assigned-per-document-by-join-order.md)
**Not changing:** the six palette tokens and their values; the hash for authors who are not members (imported authors, removed members); the account menu avatar; the agent suffix rule of `authorColorKeyOf`.

## Problem

The colour slot is a hash of the user id, so members of one document collide: on 2026-10-17 Ana, Bruno and Caio all rendered the same colour. Cursors, the members list and the timeline then cannot tell them apart.

## Goals

- Up to six members of one document have six different colours, the same in the editor cursor, the remote cursors, the members list, the timeline avatars and the version viewer.
- The own cursor has the right colour at mount, before the members poll answers.

## Non-goals

- Stable colours across member removals (ADR 0037, revisit).
- More than six distinct colours.

## Design

### Data flow

1. `libs/types/src/author-colors.ts`: `assignAuthorColorSlots({ memberIds }): Map<string, AuthorColorSlot>`; member ids in join order; each takes `authorColorSlot(id)` when free, otherwise the next free slot cyclically; from the seventh on, `authorColorSlot(id)`.
2. Server, members route (`apps/server/src/documents/documents-routes.ts`): the members list already comes ordered by `joinedAt` from `documents-repository.ts`; each member gains `colorSlot`.
3. Server, open route: `OpenedDocument.colorSlot` for the current user, from the same assignment over the document's members.
4. Web: `authorPaletteOf({ user, colorSlot })` uses the opened document's slot; `use-member-cursors.ts` and `members.tsx` read `member.colorSlot`; the timeline avatars and the version viewer resolve an author through a new `useAuthorColorSlots(documentId)` hook that maps member ids from the members query to slots and, for an author who is not a member, returns `authorColorSlot(authorColorKeyOf(author))`.

### Interfaces

- `libs/types/src/documents.ts`: `DocumentMember` (members response item) gains `colorSlot: AuthorColorSlot`; `OpenedDocument` gains `colorSlot: AuthorColorSlot`.
- `apps/web/src/testing/opened-document.ts` and the members fixtures gain the field.

### Failure handling

- A member list longer than six: slots wrap, documented.
- An author with no membership: the explicit hash branch, tested.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Where is the slot assigned | server by join order; persisted column; client | server by join order (ADR 0037), decided by the lead under the owner's delegation | 2026-10-18 |

## Test strategy summary

- Unit (red first): `assignAuthorColorSlots` (two colliding ids get two slots; join order wins; seventh wraps; empty list); the routes return `colorSlot`; `authorPaletteOf` uses the given slot; `useAuthorColorSlots` resolves members and non-members.
- E2E `final-visuals.spec.ts` or `collaboration.spec.ts`: Ana and Bruno (demo users that collide today) open one document; expected: their members-list swatches and remote cursor colours differ, and Ana's own cursor colour equals the colour Bruno sees for Ana.
