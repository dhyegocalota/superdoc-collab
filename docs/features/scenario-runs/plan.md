# Plan: Scenario runs

**Spec:** spec.md
**Tier:** 🟡
**Seam:** the E2E boot in `playwright.config.ts` (shared through `e2e/stack.ts`), the MCP server declarations, the `/open-pr` Merge section.
**Assumptions (decided, owner can override):**
- Ports 3200 (server) and 3299 (fake model) for scenario stacks; E2E keeps 3100 and 3199.
- The second server is named `playwright-second`; in the session that builds this feature it is stood in by the user-level `playwright-isolated` server, because `.mcp.json` loads at session start.
- Scenario files live under `docs/scenarios/`, indexed by `docs/scenarios/README.md`.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `e2e/stack.ts`, `e2e/scenario-stack.ts`, `playwright.config.ts`, `package.json` (scripts), `e2e/README.md`, `apps/server/src/repository-shape/scenario-stack.test.ts` | lead, inline |
| G2 | `docs/scenarios/README.md`, `docs/scenarios/core-realtime.md`, `apps/server/src/repository-shape/scenarios.test.ts`, `.mcp.json`, `.codex/config.toml`, `.agents/skills/scenario/SKILL.md`, `.agents/skills/open-pr/SKILL.md`, `.agents/skills/README.md`, `.claude/HARNESS.md`, `AGENTS.md` layout | lead, inline |

## Sequencing

G1 first (the stack must boot before the skill can run), then G2, then the proof run of `/scenario core-realtime` from this session with `playwright` and `playwright-isolated`.

## Steps

### G1

- [ ] **Step 1:** `scenario-stack.test.ts` committed red: `stackEnvironment` from `e2e/stack.ts` returns the exact environment keys the E2E config set, with the port, database directory and fake-model origin it is given; `playwright.config.ts` imports `./e2e/stack`; `package.json` has `scenario:stack`.
- [ ] **Step 2:** `e2e/stack.ts` (build-and-start command, `stackEnvironment`, the fixed test secrets and limits), `playwright.config.ts` importing it with unchanged behaviour, `e2e/scenario-stack.ts` (fake model + server on 3299/3200, fresh database directory, `ORIGIN=` and `DATABASE_DIR=` on stdout, process groups killed on SIGINT and SIGTERM, a busy port named in the error), `scenario:stack` script through `tsx`; tests green; `pnpm test:e2e` still green.

### G2

- [ ] **Step 3:** `scenarios.test.ts` committed red: every `docs/scenarios/*.md` other than the README has the front-matter keys, at least one `### T` test with one `Expect:` line, `authors` no greater than the number of `playwright*` servers in `.mcp.json`, and a row in `docs/scenarios/README.md`.
- [ ] **Step 4:** `.mcp.json` and `.codex/config.toml` with `playwright` and `playwright-second`, both `--isolated`; the skill; the `/open-pr` Merge step 0; HARNESS §5, §7, §10; skills README; `AGENTS.md` layout line for `docs/scenarios`; tests green.
- [ ] **Step 5:** proof run: `/scenario core-realtime` from this session, report and screenshots under `.pr-media/scenario-core-realtime/`, results copied into `test-plan.md`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | `playwright.config.ts` behaviour drifts after the extraction | `pnpm test:e2e` red, or the server env differs in `scenario-stack.test.ts` | restore the inline constants; the shape test pins the keys |
| 2 | ports 3200/3299 collide with a running stack | the stack script exits naming the port before starting anything | stop the other process |
| 4 | the `playwright` server losing its persistent profile breaks `/check-ui` | sign-in required on every run | that is already how the skill works; nothing to back out |
| 5 | `playwright-second` is not loaded in this session | its tools are absent | use `playwright-isolated` for author B and record it in the test plan |
| 5 | a scenario test fails on a real product defect | the Expect does not hold with a screenshot | record it as a defect with reproduction, never fix inline |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** not applicable as a UI change; the scenario run itself produces the screenshots.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
