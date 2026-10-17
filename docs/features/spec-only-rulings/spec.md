# Spec-only rulings — spec

- Status: Shipped 2026-10-17
- Tier: green (one arithmetic fix in `libs/history`, documentation, one convention).
- Owner approval: approved 2026-10-17 (the owner asked for the audit's corrections and for ADRs on the rules that lived only in specs: "aplica as correções; os que não têm merecem ADR", plus `NB` pointers from code to ADRs).
- ADRs: [0015](../../adr/0015-topics-recompute-trigger-and-identity.md), [0016](../../adr/0016-timeline-bin-budget.md), [0017](../../adr/0017-share-links-reissued-when-the-secret-changes.md); [0011](../../adr/0011-process-wide-llm-cost-caps.md) refined.
- Not changing: the bin ladder, the topics pipeline, owner rotation of share links, any endpoint or schema.

## Problem

A read-only audit of business-rule comments (2026-10-17) found that nearly every numeric rule has an ADR or learning, with four exceptions and two defects:

1. `chooseBinMs` reserved one extra bin while `binStartsCovering` adds three (one empty bin on each edge plus the inclusive last one), so a 119-minute span with 1-minute bins returned 122 bins, above `MAX_BINS = 120`.
2. ADR 0011 says any capped job turns topics `failed`; since PR #6 a busy automatic recompute keeps the ready topics.
3. The five-block recompute trigger, the half-blocks topic identity rule and the 120-bin cap were recorded only in the timeline spec.
4. Share links reissued when the signing secret changes had no record at all.

## Goals

- The bin count the chart receives never exceeds `MAX_BINS`, with both functions sharing the padding constants.
- ADRs 0015, 0016 and 0017 record the four rules with alternatives; ADR 0011 points at 0015.
- One sanctioned comment form, `// NB ADR NNNN: <rule in one sentence>`, placed on the constant or function that embodies a decision, allowed by the conventions and by the `warn-conventions.sh` hook; the nine existing decision points carry one.

## Non-goals

- No change to the bin ladder values or to the 120 budget itself.
- No comment anywhere else; the prompt's three-authors-per-edit cap stays uncommented and without an ADR (a prompt-budget detail).

## Decisions

| Question | Options | Decision | Date |
|---|---|---|---|
| Fix ADR 0011 in place or supersede it | edit the bullet; new ADR superseding 0011; new ADR refining one bullet, status line of 0011 points at it | the third: ADRs are immutable in substance, and the rest of 0011 still holds | 2026-10-17 |
| Where decision pointers live | nowhere (ADRs only); a one-line `NB ADR` comment at the code that embodies the rule | the pointer, because the reader of the constant is the one who needs the why | 2026-10-17 |
| Pointers to learnings as well | yes; no | no: learnings are traps, not decisions; the convention stays narrow | 2026-10-17 |
| `resolve` accepted tokens issued under an old secret until the owner next read the links (reviewer finding) | reword ADR 0017 to the lazy behaviour; refuse such tokens in `resolve` | refuse: a rotated secret must invalidate every link at once, and the check already existed | 2026-10-17 |

## Test strategy summary

Unit: `bins.test.ts` counts the real output of `binStartsCovering` across spans and offsets, including the 119-minute case that failed before the fix. The hook is exercised by hand with a file holding one `NB ADR` line and one plain comment. No UI changes, so no E2E and no media.
