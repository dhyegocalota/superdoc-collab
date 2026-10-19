# Plan: Snapshot compression

**Spec:** spec.md
**Tier:** 🟡
**Seam:** the options of the collaboration socket server.
**Assumptions (decided, owner can override):**
- The 1 KiB threshold is `ws`'s own default for small frames.
- Yjs V2 is not adopted; the numbers are in the spec.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/collaboration/attach-collaboration.ts`, `apps/server/src/collaboration/socket-compression.test.ts`, `docs/features/snapshot-compression/*`, `docs/features/README.md`, `.claude/rules/collaboration.md`, `docs/adr/0034-*` | `developer` |

## Sequencing

One developer, in order: red tests, the option, measurements, docs.

## Steps

### G1

- [x] **Step 1:** red tests for the negotiated extension, the smaller wire and the inflated cap.
- [x] **Step 2:** the `perMessageDeflate` option with threshold, level, concurrency and no context takeover.
- [x] **Step 3:** measure Yjs V2 against V1 on the large fixture and record the decision.
- [x] **Step 4:** the feature folder, the rule line and the ADR 0034 consequence.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | Compression CPU slows a large sync | the large-fixture E2E open takes longer than before | drop the option, frames go uncompressed |
| 2 | A proxy drops the extension header | the upgrade response lacks the extension and frames are full size | none needed, the socket works uncompressed |

**Steps with no backout:** none

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
