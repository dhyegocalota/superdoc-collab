# Plan: Import comments from an uploaded DOCX

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `importRevisions` in `apps/server/src/history/projection-worker.ts`, the one place an uploaded file's history enters the read model.
**Assumptions (decided, owner can override):**
- A comment's text counts as its volume on the timeline, so a reviewer who only commented has a visible band.
- Replies are separate events on their parent's block.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/history/src/imported-comments*`, `libs/history/src/seed-docx.ts`, `libs/history/src/read-model.ts`, `libs/history/src/imported-revisions*`, `libs/history/src/timeline/runs*`, `libs/types/src/history.ts`, `libs/types/src/timeline.ts` | lead |
| G2 | `apps/server/src/history/projection-worker.ts`, `apps/server/src/history/timeline-service.ts`, `apps/server/src/history/projection-scheduler.test.ts` | lead |
| G3 | `apps/web/src/features/timeline/bin-edits*`, `apps/web/src/features/timeline/timeline-copy.ts` | lead |

## Sequencing

G1, then G2 and G3. One lead, no sub-agents: the owner asked for the fastest path.

## Steps

### G1

- [x] **Step 1:** failing unit tests for `toImportedComments` (comment, reply, tracked-change card skipped, missing author throws), then the mapper.
- [x] **Step 2:** `buildSeedDocx` takes comments; `ImportedRevision.kind`; `BlockChangeKind.Commented`.
- [x] **Step 3:** failing run test (a comment and an insertion on the same block and bin stay two runs), then `commented` on runs.

### G2

- [x] **Step 4:** failing integration test (upload with a tracked change and a comment, both read back imported with their authors), then the worker lists comments.
- [x] **Step 5:** `toTimelineEvent` marks comment events.

### G3

- [x] **Step 6:** failing component test (a comment run shows the comment label and no `ins`), then `BinEdits`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 4 | A real DOCX has a comment with no date or author, so the whole import fails | Import error logged for the document; tracked changes missing too | Skip incomplete comments instead of throwing |
| 3 | Run key change alters existing run counts | `runs.test.ts` and timeline tests fail | Revert the key change |

**Steps with no backout:** none

## Z. Prove and ship

- [x] **Tester briefing:** skipped on the owner's request (fastest path); the lead walks the flow.
- [ ] **Tester run:** the lead uploads a DOCX with comments in Playwright MCP and checks the timeline.
- [ ] **Reviewer:** skipped on the owner's request.
- [ ] **/check-ui:** screenshot of the bin edit list with a comment.
- [ ] **/open-pr:** local gate passed, PR opened, merged, deployed.
