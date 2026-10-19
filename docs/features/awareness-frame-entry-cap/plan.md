# Plan: One awareness frame is bounded by 64 entries before Hocuspocus decodes it

**Spec:** spec.md
**Tier:** 🟡
**Seam:** the `ws` listener in `attach-collaboration.ts` that already counts frames before Hocuspocus' receiver, and the awareness `update` event of the loaded document.
**Assumptions (decided, owner can override):**
- The frame entry cap is its own constant, `MAX_AWARENESS_ENTRIES_PER_FRAME = 64`, because the stock provider relays one entry per changed peer; `MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION = 8` stays the hook-level cap on ids a connection holds (spec, known gaps).
- An unowned `updated` id nobody holds is adopted by its sender, not refused (spec, why the origin check adopts).

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/collaboration/frame-bucket.ts`, `socket-message-limit.ts`, `attach-collaboration.ts` and their tests, `libs/types/src/constants.ts` | `developer-awareness` |
| G2 | `apps/server/src/collaboration/awareness-origin.ts`, `collaboration-server.ts`, `apps/server/src/testing/socket-frames.ts`, the origin tests in `attach-collaboration.test.ts` | `developer-awareness` |
| G3 | ADR 0040, the socket-message-limit spec and test plan, `.claude/rules/collaboration.md`, this folder, the learning and the two index READMEs | `developer-awareness` |

## Sequencing

G1, then G2, then G3, one developer, one commit per step with the red test commit first.

## Steps

### G1

- [x] **Step 1:** red tests for `awarenessEntryCountOf`, `claimsTooManyEntries` and the end-to-end close with the entries reason (stubs throw `not implemented`), then the reader, the check and the `emit` wrapper. — evidence: red ef426858, fix cebb50f8; the cap moved from 8 to its own constant of 64 in 193d27cc.

### G2

- [x] **Step 2:** red tests for the replay, the foreign id and the three pins, then `trackAwarenessOwners` registered in `afterLoadDocument`. — evidence: red 23022237, fix 193d27cc, which also adds the same-clock relay test.

### G3

- [x] **Step 3:** docs (evidence: the commit `docs(awareness-frame-entry-cap)` of this lane): ADR 0040 amended, the spec sentences, the test plan attribution, the rule, the constant's pointer, this folder, the learning and the index rows.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | A room holding more than 64 awareness states closes a provider that joins it | the log line "Collaboration socket closed for claiming too many awareness entries in one frame" in a room of 65 tabs | raise `MAX_AWARENESS_ENTRIES_PER_FRAME`, or revert the fix commit |
| 1 | The wrapped `emit` withholds a frame it should deliver | a provider that never syncs; every `attach-collaboration.test.ts` case fails | revert the fix commit |
| 2 | A relay of the stock provider is dropped or closes its sender | the same-clock relay test turns red; a closed socket right after a provider joins a populated room | revert the fix commit |
| 2 | A legitimate provider is dropped or closed | the reconnect pin turns red; a closed socket right after a reconnect in a loaded room | revert the fix commit |

**Steps with no backout:** none; both fixes are plain reverts and lose no data.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
