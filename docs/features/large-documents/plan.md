# Plan: Large documents

**Spec:** spec.md
**Tier:** 🔴
**Seam:** the projection handler's import, the projection scheduler's worker options, the collaboration server's creator refusal, the members answer and the document page's transport report.
**Assumptions (decided, owner can override):**
- The import cap is 2 MB of DOCX.
- The server heap is 70% of the container limit and the projection worker's is 50%.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/*`, `apps/server/src/history/*`, `apps/server/src/config/*`, `apps/server/src/server.ts`, `docker/entrypoint.sh`, `.env.example` | `developer` |
| G2 | `apps/server/src/collaboration/*`, `apps/server/src/documents/documents-routes*`, `apps/web/src/features/editor/*`, `docs/adr/0033-*` | `developer` |
| G3 | `docs/features/large-documents/*`, `docs/features/README.md`, `docs/next.md` | `developer` |

## Sequencing

One developer, in order: docs, import gate, heap sizing, creator recovery, Scale row.

## Steps

### G3

- [x] **Step 1:** the feature folder and its index row.

### G1

- [x] **Step 2:** red test for the import gate in the projection handler's unit file, then the cap constant and the gate.
- [x] **Step 3:** red tests for the environment variable and the worker option, then the parsing, the scheduler option and the entrypoint. The SuperDoc host process has no memory option in the SDK; the size gate is its only protection.

### G2

- [x] **Step 4:** red tests for the restart refusal reason, the members answer and the page's branch per reason, then the code and the ADR 0033 consequence.

### G3

- [x] **Step 5:** the Scale row in `docs/next.md`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | A large DOCX shows no imported revisions | the log line names the document and size | raise the constant |
| 3 | A wrong limit starves the server | the entrypoint line prints the limit and heap at start | unset the variable, revert the entrypoint |
| 4 | A reload loop on a refused creator | the page re-opens once per answer; a fresh ticket ends the refusal | revert the page's branch, the banner returns |

**Steps with no backout:** none

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
