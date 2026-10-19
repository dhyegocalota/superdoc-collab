# Test pruning

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's request, translated: "review and remove unit, e2e or integration tests that are useless; example of a useless test: all or almost all in globals.test.ts")
**Not changing:** product code; the gates in `scripts/verify*`; tests owned by lanes still building (listed in plan.md)

## Problem

Some tests restate the implementation instead of checking behaviour: `apps/web/src/styles/globals.test.ts` reads `globals.css` and asserts that a token equals the literal written in it. Such a test fails only when someone changes the value on purpose, so it catches no bug and costs a change every time a token moves.

## What counts as useless (delete)

1. **Restated literal:** reads a source, copy or CSS file and asserts a literal value or string that lives in that same file (token values, copy strings, class names, enum members).
2. **TypeScript already guarantees it:** enum membership, type shape, a required prop present.
3. **Mock echo:** calls a thin wrapper with a mock and asserts the mock was called with the same arguments; no branch, no transformation.
4. **Static markup pin:** asserts Tailwind classes or element order with no behaviour behind it.
5. **Duplicate layer:** the same behaviour with the same assertion at two layers; keep the cheaper one, prove with a mutation check that the survivor still goes red.

## What stays (keep)

- A relation across files or systems (a mapped SuperDoc variable exists in the installed SuperDoc stylesheet; a README block equals `package.json`; a route answers 404 to a non-member).
- A computed property (contrast reaches AA; a date shifts to a zone; a limit refuses the N+1th request).
- Every E2E that drives the product as a user; delete only an E2E that duplicates another E2E's steps and assertions.
- Red-first history is irrelevant: a test that was once red can still be useless today.

## Deliverable

- The deletions, one commit per package (`test(<package>): remove tests that restate the implementation`), each file left green or removed when empty.
- `docs/features/test-pruning/report.md`: one line per deleted test, `path::name | category 1-5 | what still covers the behaviour, or "no behaviour"`, plus the mutation checks for category 5 (what was broken, which survivor went red), and a "kept but questionable" list with the reason each stayed.
- Counts before and after per package in the report.

## Test list

- The touched test files run green; `pnpm typecheck`; the counts in the report match `vitest run` output.
