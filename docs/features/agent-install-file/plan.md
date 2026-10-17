# Plan: Agent install file

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `README.md` → `## Quick install`, `docs/install.md`, and the two repository-shape tests that pin them.
**Assumptions (decided, owner can override):**

- The lead builds this inline (one group, docs plus two test files); a fresh tester and a fresh reviewer prove it.
- The prompt names the repository URL so it works from an empty directory; inside a clone the agent reads the local file.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `docs/agent-install.md`, `README.md`, `docs/install.md`, `AGENTS.md`, `.agents/hooks/doctor.sh` (`docker` lost line), `.agents/hooks/hooks.test.sh` (its expectation), `apps/server/src/repository-shape/readme-run-block.test.ts`, `apps/server/src/repository-shape/delivery-docs.test.ts`, `docs/features/README.md` | lead |

## Sequencing

One group; tests first, then the documents.

## Steps

- [x] **Step 1:** Tests first. `readme-run-block.test.ts`: the checked text is the README's `## Quick install` section plus `docs/install.md`'s `## Run from source` section; the fenced-block rule names Quick install. `delivery-docs.test.ts`: the agent phrases are read from `docs/agent-install.md`; the README's Quick install and `docs/install.md`'s "Install with an agent" both contain `docs/agent-install.md`. Run them: red on the missing heading, the missing file and the missing prompt.
- [x] **Step 2:** `docs/agent-install.md` with the six steps; `README.md` Quick install; `docs/install.md` one-line prompt and `## Run from source`; `AGENTS.md` and the doctor's `docker` line say Quick install; `hooks.test.sh` expectation follows. Run the repository-shape tests and `hooks.test.sh`: green.
- [x] **Step 3:** Mutation checks: drop a phrase from `docs/agent-install.md`, rename a script in the moved from-source block, point the README prompt at another file; each turns its test red; restore.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | a section helper picks up the next section | a variable from another section is reported | stop the section at the next `## ` heading, as today |
| 2 | a README link or anchor breaks | `delivery-docs.test.ts` link check red | fix the link |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester run:** a fresh `tester` executed `test-plan.md`.
- [x] **Reviewer:** a fresh `reviewer` returned a verdict.
- [x] ~~**/open-pr:** gates passed, PR opened, merged.~~ The owner asked for a direct push to main; reviewer WITH RESERVATIONS (finding 1 fixed in 7decfb8), tester 3/3, repository-shape 114/114 and three mutations red.
