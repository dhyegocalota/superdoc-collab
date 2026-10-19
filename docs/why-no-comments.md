# Why there are no comments

The code in this repository has no comments. The one exception is a single-line pointer to a decision record. This page says where the explanation lives instead, and what that costs.

## The rule

Names carry the meaning. A function, a variable or a constant is named so that a reader sees what it does without a note beside it. A condition that needs explaining gets a name before the `if` that uses it. Anything a comment would have said about how the code works belongs in a better name or a smaller function.

## Three homes for explanation

- **The code says what.** Identifiers, types and automated checks describe behaviour. A check is the executable statement of a rule and cannot drift from it.
- **ADRs say why.** A decision that cannot be read from the code, such as a threshold, a cooldown or a choice between two designs, lives in `docs/adr/` with its context, the alternatives and the date.
- **The pointer links the two.** One line above the constant or function that embodies the decision names the ADR and states the rule in one sentence.

## The one exception

The pointer has this exact shape: `// NB ADR NNNN: <the rule in one sentence>`. It sits on the constant or function that embodies the decision. It never explains mechanics, and it never stands alone: the ADR it names must exist.

A real one, from `libs/types/src/timeline.ts`:

```ts
// NB ADR 0015: topics are recomputed automatically only once this many new blocks sit outside every topic, so single edits spend no model call.
```

The line restates the rule so the reader does not have to open the ADR to know what the constant means. The ADR holds the reasoning and the alternatives that were rejected.

## When a reader needs more

1. Check whether a better name or a smaller function removes the question. If it does, change the code.
2. If the answer is a reason, not a mechanic, write the ADR first. It records the context, the decision and why the alternatives lost.
3. Then add the pointer on the code the ADR governs, in the shape above.

A comment that explains mechanics is a sign the code is unclear, not that a note is missing. Fix the code.

## The trade-off

A reader who holds only a single file sees the rule in the pointer but not the reasoning. The reasoning is one jump away in `docs/adr/`, and the pointer names exactly where. In return, the explanation has one home that is reviewed, dated and linked, instead of notes scattered through the code that go stale when the code changes and nobody notices.

The convention is written in `AGENTS.md` under Code conventions, and the process is described in the [harness](../.claude/HARNESS.md).
