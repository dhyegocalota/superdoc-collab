---
name: learning
description: Records or revisits a dated learning in docs/learnings/. Use when diagnosis took more than fifteen minutes, when a failure was not predicted by the failure-modes table, when a doc or vendor API contradicted reality, when a hook surprised you, when the owner says "record a learning", "write this down", or "revisit learnings"; also at the learnings sweep before /open-pr.
metadata:
  author: in-house
  created: 2026-10-16
---
# Learning

Format and promotion rules: `.claude/HARNESS.md` section 8. Two modes.

## Record

1. Get the slug (kebab-case) and today's date. File: `docs/learnings/YYYY-MM-DD-<slug>.md`. Refuse if it exists.
2. Write exactly this shape:

```
# <Trap, stated as the symptom you will see again>
- Date: YYYY-MM-DD
- Inspired by: <ADR, PR, test, incident or doc that surfaced it>
- Revisited: YYYY-MM-DD — <still true | changed because …>

## Signal
## Cause
## Do
## Anchor
```

3. Signal is the symptom as you will see it, never the diagnosis. If the Signal names the cause, rewrite it.
4. Cause is one paragraph. Do is the move that avoids the trap.
5. Anchor must name at least one file, commit or test. If you cannot name one, ask the owner or find it before writing.
6. Add a row to the index table in `docs/learnings/README.md` under its area (collaboration, history, testing, tooling), in date order: date, title, file, last revisited. `document-indexes.test.ts` fails on a missing row or an area out of date order.
7. Decide on promotion (below) in the same change.

## Revisit

1. Input is a path or a changed area. Find every learning whose Anchor touches it.
2. Open each one. Verify that Signal and Do still hold against the current code.
3. Append one line: `- Revisited: YYYY-MM-DD — still true` or `- Revisited: YYYY-MM-DD — changed because …`. If it changed, correct the body and say what.
4. Update the "last revisited" column in the index.
5. If the same trap recurred, propose promotion: a fact to `.claude/rules/`, a process to `.claude/HARNESS.md`, a mechanical check to a hook, a repeatable procedure to a skill. Ask the owner before promoting.

If a learning is ambiguous, or you cannot verify its Signal, stop and ask. Never append `still true` without checking.
