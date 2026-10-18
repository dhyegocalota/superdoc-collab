# The typecheck fails with a duplicate declaration in libs/types right after a lane merge

- Date: 2026-10-17
- Inspired by: `aee3a17` and `6b49cd2`, two fixes after merging lanes G1 and G6, then G3 and G4
- Revisited: 2026-10-17 — still true
- Revisited: 2026-10-18 — still true: summary-mobile added copy to `timeline-copy.ts` and declared nothing twice
- Revisited: 2026-10-18 — still true: timeline-idle-gaps added copy to `timeline-copy.ts` and declared nothing twice

## Signal
Every package that imports the shared types fails to compile with a redeclared `export const`, enum or type, although each lane was green alone and the merge had no textual conflict.

## Cause
Lanes work in parallel from a plan that names the same shared constant for each. Each lane mirrors it into `libs/types` in a different place, so git merges both without a conflict and the file holds two declarations.

## Do
After every merge of lanes, scan the shared files before running anything else:

```
grep -ohE "^export (const|enum|type) [A-Za-z0-9_]+" libs/types/src/*.ts | sort | uniq -d
```

An empty output is the pass. Keep one declaration, and when the plan names a shared constant, assign it to one lane.

## Anchor
`libs/types/src/constants.ts` (`aee3a17`, merged into G7 by `c6cf701`), `libs/types/src/timeline.ts` and `apps/web/src/features/timeline/timeline-copy.ts` (`6b49cd2`)
