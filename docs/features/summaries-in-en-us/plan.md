# Plan: Summaries in en-US

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/server/src/insights/prompts.ts`, the two summary system prompts
**Assumptions (decided, owner can override):**
- Topic names keep the document's language; only the sentences about edits change.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/insights/prompts.ts`, `apps/server/src/insights/prompts.test.ts`, `docs/features/llm-insights/plan.md`, `docs/features/summaries-in-en-us/tester-briefing.md` | `developer-1` |

## Sequencing

One group.

## Steps

### G1

- [x] **Step 1:** failing test first: `prompts.test.ts` asserts that the topic summaries prompt and the selection prompt both carry the rule `Write in English (en-US), whatever the language of the edited text.` and that neither carries `Write in the language of the edited text.`; red on the current prompts. Evidence: 87fef18c.
- [x] **Step 2:** `prompts.ts`: one `SUMMARY_LANGUAGE` constant and one rule line built from it, used by both summary prompts; the quoted prompt in `docs/features/llm-insights/plan.md` follows; green. Evidence: 1c8a824f.
- [x] **Step 3:** `tester-briefing.md` written by the developer. Evidence: 84ad5e81 on this branch.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | The model keeps the document's language despite the rule | the tester's real-model probe returns a Portuguese sentence | move the rule to the task sentence and add an example with Portuguese edits and an English sentence |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** the tester's screenshot of the card with an English sentence over Portuguese edits.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
