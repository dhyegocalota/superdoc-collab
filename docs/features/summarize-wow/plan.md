# Plan: Summarize edits with AI: the sentence appears first and grows while it is written

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `SummarizeService.run`, `SelectionSummariesService.generate` and `read`, `llm-client.ts`, `useSelectionSummary`, `SelectionSummaryCard`.
**Assumptions (decided, owner can override):**
- The partial sentence lives in memory beside the step and the grouping failure; it is a property of the running job, so no migration and no write throttle are needed.
- The topic sentences run after the step is Idle without a step of their own, because a visible step would keep the card busy.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/insights/`, `apps/server/src/testing/language-model.ts`, `libs/types/src/timeline.ts` and its test, `apps/web/src/features/timeline/`, `e2e/fake-openrouter.ts`, `e2e/selection-summary.spec.ts`, `docs/adr/0006-*`, `0011-*`, `0012-*`, `0041-*`, `docs/adr/README.md`, `docs/features/llm-insights/spec.md`, `docs/features/summarize-wow/`, `docs/features/README.md` | `developer-ac` |

## Sequencing

One group, one red commit and one fix commit per step, in order.

## Steps

### G1

- [x] **Step 1:** publish the sentence first; the regroup runs beside a non-topic selection write.
- [x] **Step 2:** stream the selection sentence and expose the partial; ADR 0041.
- [x] **Step 3:** the client polls every second while running and reveals the partial word by word.
- [x] **Step 4:** the last good sentence stays on failure; the timeout has its own line.
- [x] **Step 5:** the fake model gains a delay and a streamed reply; one E2E sees the sentence grow.
- [x] **Step 6:** documentation drift in ADR 0006, 0011, 0012 and the llm-insights spec.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | the parallel regroup and write both spend a call and the cooldown starts twice | the cooldown test or the call count test fails | run the regroup before the write again |
| 2 | the provider does not stream | the partial stays empty and the sentence lands at once | the final sentence still lands; the card shows no growth |
| 2 | the stream error is swallowed | a failed call stores no failure | read the failure from the output promise |
| 3 | the reveal animates for a reader who asked for reduced motion | the hook test with reduced motion fails | render the partial at once |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` returned a verdict.
- [ ] **/check-ui:** screenshots and video recorded and uploaded.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
