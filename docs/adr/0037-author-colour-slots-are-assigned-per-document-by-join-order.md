# 0037. Author colour slots are assigned per document by join order

- Status: Accepted
- Date: 2026-10-18
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the final-visuals walk of 2026-10-17, where Ana, Bruno and Caio all rendered `rgb(184, 46, 168)` (`docs/features/final-visuals/test-plan.md`, "server-assigned slots are the follow-up"); the owner's report of 2026-10-18.

## Context

Every author colour is one of six tokens (`--author-1` to `--author-6`), chosen by an FNV-1a hash of the author's key (`authorColorSlot` in `libs/types/src/author-colors.ts`). The slot is a pure function of the user id, so two members of one document share a colour whenever their hashes land on the same slot, which happened for three of the four demo users. The colour is read in six places: the editor's own cursor at mount, the remote cursors, the members list, the timeline avatars, the version viewer and the account menu. Nothing on the server stores or assigns a colour; `document_members` carries `joinedAt` and the members route already returns members in join order.

## Decision

The slot of a member is assigned per document from the members in join order: each member takes the hash slot of its id when it is free, otherwise the next free slot; from the seventh member on the hash slot is taken as before (collisions accepted beyond six members). The function `assignAuthorColorSlots({ memberIds })` lives in `libs/types` and runs on the server. The members route returns `colorSlot` per member and the open route returns `colorSlot` for the current user, so the editor mounts with the right colour before the members poll answers. The web reads a member's slot from the members response and falls back to the hash only for an author who is not a member of the document (an imported author with no id, or a member who was removed): that branch is explicit and tested, not a default.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Assign per document by join order, computed on the server from `joinedAt` (chosen) | no schema change; one shared function; every client agrees because the server orders the list | a member's slot can shift when an earlier member who displaced it leaves the document | the shift is rare and only touches a displaced member |
| Persist a `colorSlot` column assigned at insert | stable forever | a schema change and a migration; the open route would still need a lookup | the shift the chosen option tolerates is not worth a migration |
| Resolve collisions on the client among the polled members | no server change | the editor mounts before the members poll answers, so the own cursor would start with one colour and change; agent and timeline authors would need the same resolution in three components | the first paint would be wrong |
| A larger palette | fewer collisions | still a hash; the final-visuals design fixed six distinguishable hues | does not remove the collision |

## Consequences

- Up to six members of one document never share a colour; the seventh and later may.
- The account menu avatar is not per document and keeps the hash colour; it may differ from the user's colour inside a document.
- The members and open responses grow by one integer field; a client from before this change ignores it.

## Evidence

The walk of 2026-10-17 at `docs/features/final-visuals/test-plan.md` (three demo users on one slot). The unit test of `assignAuthorColorSlots` pins the join-order assignment and the seventh-member wrap.

## Revisit when

A document regularly has more than six members, or the owner wants stable colours across member removals (then the persisted column).
