# Why no comments

**Lane:** docs
**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner's request, translated: "I want a doc docs/why-no-comments.md (or a README section) explaining the decision: code is its own documentation, ADRs carry the why, NB ADR points from the code to the decision")
**Not changing:** the convention itself, AGENTS.md wording

## Change

- New `docs/why-no-comments.md`, short (under 80 lines): the convention (no comments; names carry the meaning), the three places the explanation lives instead (the code for the what, `docs/adr/` for the why, the one-line `// NB ADR NNNN:` pointer from the code to the decision), the exception's exact shape with one real example from the repository, what to do when a reader needs more (write the ADR first, then the pointer), and the trade-off accepted (a reader without the repository loses the why; the pointer names where it is).
- README "Read more" gains one bullet linking it; `docs/architecture.md` links it where it describes conventions, if it does.

## Test list

- `pnpm verify` class `docs`: format and secrets gates. The repository-shape test that pins README links (`apps/server/src/repository-shape/`) stays green.
