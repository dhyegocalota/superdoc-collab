# Plan: Gate by path

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `pnpm verify`, the one command the skills and the harness call
**Assumptions (decided, owner can override):**
- The script is Bash with `jq`, like the hooks; `jq` is already required by the doctor.
- Records live under the git common directory, so every worktree of the clone shares them and nothing is committed.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `scripts/verify.sh`, `scripts/verify-gates.tsv`, `scripts/verify.test.sh`, `package.json`, `.github/workflows/verify.yml`, `apps/server/src/repository-shape/ci-workflow.test.ts`, `.agents/hooks/doctor.sh`, `.agents/hooks/hooks.test.sh` | `developer` (mid model) |
| G2 | `.claude/HARNESS.md`, `.agents/skills/verify/`, `.agents/skills/open-pr/`, `docs/features/`, `docs/adr/`, `docs/learnings/` | lead |

## Sequencing

G2's ADR, spec and plans land first. G1 builds red then green. G2's harness and skill text lands after G1 is green, so it names the real flags.

## Steps

### G1

- [x] **Step 1:** red: `scripts/verify.test.sh` with every case of `test-plan.md`, `scripts/verify.sh` a stub that prints `verify.sh is not implemented` and exits 1; commit alone. — evidence: 9564661
- [x] **Step 2:** `scripts/verify-gates.tsv` and `scripts/verify.sh` until the test is green. — evidence: 593d895
- [x] **Step 3:** `package.json` scripts, `verify.yml` `checks` step and its repository-shape pin, the doctor's `gitleaks` line and its hook test. — evidence: 410bf1e
- [x] **Step 4:** tester briefing (the lead ticks the test plan; tooling has no tester, ADR 0028). — evidence: the commit that adds tester-briefing.md

### G2

- [x] **Step 5:** ADR 0028, learning, spec, plan, test plan, features index. — evidence: c7d9caa
- [ ] **Step 6:** `/verify` calls `pnpm verify`; `/open-pr` reads the class, the docs lane, the local merge.
- [ ] **Step 7:** `HARNESS.md`: invariants 2–4, §1 docs lane, §5, §7, §10, §12.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | A product path classified as docs skips E2E | a stress case in `verify.test.sh` goes red | fix the map row; unknown paths already run everything |
| 2 | A stale record hides a red gate | the record cases go red | delete `<git common dir>/verify/` |
| 3 | `pnpm verify` escapes the owner's heavy lock | the command runs alongside another suite | the owner's hook lists `verify` |
| 7 | Harness text names a flag the script lacks | `delivery-docs` or the reviewer | fix the text |

**Steps with no backout:** none

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Test plan:** the lead ticked it with the gate output (tooling, ADR 0028).
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict and refuted the three riskiest claims.
- [ ] **Security reviewer:** verdict recorded.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened, local gate posted, merged.
