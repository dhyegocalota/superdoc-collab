# HARNESS — how work happens in this repo

**Placement rule.** An imperative about *how to work* belongs here. A fact that *describes the system* belongs in `.claude/rules/<domain>.md`. A *decision* and its alternatives belong in `docs/adr/`. A *trap* belongs in `docs/learnings/`.

```
AGENTS.md            facts and conventions, pointers to this file          (CLAUDE.md, GEMINI.md link here)
.claude/HARNESS.md   this file: the process
.claude/rules/       domain facts; Claude Code loads them by path, every other tool opens the ones whose globs match
.agents/roles/       agent role bodies (one source for .claude/agents and .codex/agents)
.agents/skills/      skills: vendored superpowers subset + feature, adr, learning, verify, check-ui, open-pr, scenario
.agents/hooks/       hook scripts (one source for .claude/settings.json and .codex/hooks.json)
docs/features/<slug> spec.md + plan.md + test-plan.md for every feature or fix
docs/adr/            decisions            docs/learnings/   dated traps
docs/scenarios/      agentic walks of the product core, one file per flow, run with /scenario
<package>/README.md  apps/*, libs/* and e2e: purpose only (no commands or configuration)
```

The process is tool-agnostic. Claude Code, Codex and any agent that reads `AGENTS.md` follow the same phases; only the mechanics of spawning sub-agents differ (see Agents). Every surface has one source under `.agents/` and a thin adapter per tool ([ADR 0014](../docs/adr/0014-one-source-per-agent-surface.md)).

## 0. Invariants

1. Nothing is built before the owner and the agent agree on 100% of the design. Agreement is explicit, in writing, in the spec.
2. Every feature **and every fix** gets `docs/features/<slug>/` with `spec.md`, `plan.md` and `test-plan.md`. Never one without the others. A fix's spec may be ten lines; it still exists.
3. Executing the test plan is the priority. A plan whose test plan is not run is not done. A behaviour-preserving refactor is the one exception: the reviewer and the full CI run prove it (section 5).
4. The agent that builds never runs the test plan. The tester is a different sub-agent with a fresh context.
5. Every PR is reviewed by a reviewer sub-agent before it opens. There is always a reviewer.
6. Every PR that touches UI carries screenshots and a playable video recorded through Playwright MCP, hosted as GitHub Release assets and embedded in the body.
7. Every decision with alternatives becomes an ADR before the code that depends on it.
8. Everything in the repo is in English.
9. Tests are mandatory. No `sleep`. No `?? default`. No comments other than `// NB ADR NNNN:` pointers. See `AGENTS.md` → Code conventions.
10. Every PR states its merge sensitivity. A sensitive PR also states its blast radius and ends with a checklist a human runs before merging (section 7).
11. The agent repairs its own machine before it works, and never works with a blocking hook off. `.agents/hooks/doctor.sh` is the only list of the tools the harness needs; it runs at session start, as `/verify` gate 0 and on CI, and prose never repeats it. It reports; the agent asks before installing ([ADR 0026](../docs/adr/0026-the-agent-repairs-its-own-machine-doctor-reports-never-installs.md)).

## 1. Agree

Start with the `brainstorming` skill, always, for features and fixes alike. One question at a time. Present options with trade-offs and a recommendation; **the owner decides**. Design-system choices (components, typography, colours, chart style) are the owner's and are never picked silently.

Agreement is reached when the owner approves the written `spec.md`. "Sounds good" in chat approves writing the spec, not building.

Classify the change so the depth of the spec matches the risk:

| Tier | Example | Spec depth |
|---|---|---|
| 🟢 small | copy, one-file fix, a flag | problem, change, test list |
| 🟡 medium | new endpoint, new panel, schema change | + data flow, failure modes |
| 🔴 structural | history pipeline, auth, collaboration, deploy | + ADR, alternatives, rollback, spike if an assumption is unproven |

When in doubt, take the heavier tier. Hidden complexity discovered mid-task upgrades the tier: stop, say so, step up.

## 2. Record

A decision with alternatives → `adr` skill → `docs/adr/NNNN-<slug>.md` (template in `docs/adr/_template.md`). Record it before the dependent code exists. Supersede, never rewrite history. Link the ADR from the spec.

## 3. Plan

`feature` skill → copies `docs/features/_template/` to `docs/features/<slug>/`.

- `spec.md`: the agreed design. Goals, non-goals, data flow, interfaces, failure handling, open questions resolved with the owner's answer.
- `plan.md`: written with the `writing-plans` skill. Steps in `- [ ]` boxes, **all empty when authored**; a pre-ticked plan is a report of work that has not happened. Disjoint file ownership per developer sub-agent. A failure-modes table: step, what breaks, the concrete signal, how to back out. Steps with no backout are listed by name.
- `test-plan.md`: written *before* building. Unit, E2E, Playwright MCP walk, edge cases, adversarial review, coverage honesty. Every edge case is its own checkbox stating the input and the exact expected outcome.

Both plans are reviewed by a sub-agent before building (`reviewer` role, lens: "what is missing or ambiguous").

## 4. Build

- Work on a `feat/`, `fix/`, `docs/` or `chore/` branch, never on `main`.
- `developer` sub-agents implement. Each owns disjoint paths named in the plan. They tick their own steps. A step that turns out wrong is struck through with the reason, not deleted.
- `test-driven-development` skill: failing test first, confirm it fails for the right reason, minimal code, green, refactor. **Commit the failing test on its own before the implementation commit**, so the tester can prove red-first from `git log` (see `docs/learnings/2026-10-16-commit-the-failing-test-first.md`).
- The red commit may add a stub of the new symbol that throws `<name> is not implemented`, so `pnpm typecheck` stays green and the run reaches the named assertion. The test plan and the tester briefing record the failure text the red run actually printed, not the one expected.
- A test that is green when it lands is a **pin**, not a red test. Its commit and its briefing row say `pin`; it never stands in for a red-first box.
- Prettier is enforced in CI (`pnpm format:check`). Run `pnpm exec prettier --write <staged files>` before every commit; Markdown and YAML are ignored by `.prettierignore`.
- The `Co-Authored-By` trailer names the model that wrote that commit. Mixed trailers across one lane are correct; never rewrite them to match.
- Developers may run unit tests and typecheck for their own loop. They never run `test-plan.md` and never declare the feature works.
- When a developer finishes, it writes a **tester briefing** into `docs/features/<slug>/tester-briefing.md`: what changed, how to run it, which tests are red today and green after, and every "it works" stated as a hypothesis.
- Stuck after three honest attempts → `systematic-debugging` skill, then escalate to the owner with evidence.
- **Docs move with the code.** A change that makes a README, a `.claude/rules/` fact or the `AGENTS.md` layout wrong updates it in the same commit. A package README states purpose only, never commands, configuration or behaviour the code already shows, and links the folders it names so a rename fails CI. The `remind-docs.sh` Stop hook names the documents that describe uncommitted changes; update them or say why none applies.

**Parallel lanes.** When the lead runs several developers at once:

- One developer per file set, one worktree per lane. The lead's prompt gives each developer an explicit ownership list and names the files its siblings own.
- A developer that must touch a sibling's file stops and asks the lead, or leaves the change out and notes it in the tester briefing. It never edits the file on its own.
- Developers commit on their lane branch and never push. The lead merges the lanes and pushes.
- Lane branches take other branches by merge, never by rebase: a rebase rewrites the red-first hashes the test plan cites.
- When `main` moves, the lead tells each developer what landed and which of its files collide. The developer merges `main` at its next task boundary, never mid-step.
- Two developers never do the same step. When a step was done twice anyway, reconcile the two in the merge and note it in `plan.md`; never revert either one.

## 5. Prove

- A `tester` sub-agent, never the developer, with a fresh context, executes `test-plan.md` end to end and ticks boxes with evidence (commit hash, log path, counts, screenshot path).
- Browser work runs through **Playwright MCP** from the user's perspective: walk the whole flow, not the changed screen; assert what the user sees; take the unhappy paths on purpose; read console and network; cover empty, single and many; both desktop and narrow widths; multi-author flows drive each author through its own Playwright MCP server (`playwright`, `playwright-second`, both `--isolated`), never two tabs of one browser, which share the session ([ADR 0023](../docs/adr/0023-agentic-scenario-runs-with-one-browser-per-author.md)).
- **Playwright MCP down.** The tester drives a throwaway spec, `e2e/_walk-<slug>.spec.ts`, with a scratch copy of `playwright.config.ts` whose `PORT` and fake model port (`e2e/fake-openrouter-origin.ts`) differ from any stack already running. It takes screenshots at 1280 and 375, compares them with the screenshots taken before the change, then deletes the spec and the config. `e2e/_*.spec.ts` is never committed.
- A change that folds or deletes tests is proven with **mutation checks**: break the behaviour the dropped test covered, confirm a surviving test goes red, restore. Record each mutation and the test that caught it.
- Edge cases are hunted during execution, not only listed upfront. New ones found go into `test-plan.md` and get a regression test.
- Any bug found returns to Build. The tester never fixes product code.
- A behaviour-preserving refactor lane needs no tester: the reviewer and the full CI run, E2E included, are the proof. A lane that changes anything the user sees always gets one.
- `verification-before-completion` skill before anything is called done: run it, read the output, then claim it.

## 6. Review

- A `reviewer` sub-agent, with a fresh context, reviews the diff before the PR opens: conventions (`AGENTS.md`, `.claude/rules/`), correctness, security (auth, session tokens on sockets, SQL binding, enumeration-safe auth responses, secrets, path traversal on uploads, DOCX size limits, tenant isolation per document), performance budgets from the ADRs, and tests. It also tries to **refute** the tester: pick the three claims most likely to be wrong and attack them.
- Output: numbered findings `CRITICAL | IMPORTANT | MINOR`, each with file:line, the rule, the production consequence and a minimal fix; then the **blast radius** (surfaces touched, who notices first, how to roll back, whether rollback loses data) and `Merge sensitivity: LOW | MEDIUM | HIGH` with a one-line reason; closing with `Ship-ready? YES | NO | WITH RESERVATIONS`.
- A commit that claims to be formatting only is re-diffed with whitespace and quotes normalised (`git diff -w`, then Prettier on both sides) before "no behaviour change" is trusted.
- Red-first claims are spot-checked in a throwaway worktree: check out the red commit, run the named test, compare the failure with the text the test plan records.
- Findings are delivered in chat and fixed before the PR. The reviewer never posts to GitHub.
- A `security-reviewer` sub-agent, fresh and read-only, then attacks the same diff with the repository's threat model (sessions, per-document authorization, share links, credentials, storage, secrets in prompts and logs, supply chain) and answers `Security verdict: CLEAR | FINDINGS | NOT APPLICABLE` ([ADR 0022](../docs/adr/0022-mechanical-security-gates-and-a-security-reviewer.md)). It runs on every diff except one made only of Markdown under `docs/` and READMEs; a `CRITICAL` or `IMPORTANT` finding goes back to Build.

## 7. Ship

`/open-pr` runs the gates in order and stops at the first failure:

1. `/verify`: typecheck → security audit → secret scan → unit → E2E.
2. `test-plan.md` fully ticked by the tester, with evidence.
3. Reviewer verdict `YES` (or `WITH RESERVATIONS` acknowledged by the owner).
3b. Security verdict `CLEAR` or `NOT APPLICABLE`; `FINDINGS` at `CRITICAL` or `IMPORTANT` goes back to Build. The verdict line goes into the PR body under `## Security`.
4. UI touched → `/check-ui` recorded: the `recorder` role captures screenshots and a `recordVideo` walk, converts with ffmpeg to `.mp4` and `.gif`, uploads to the GitHub Release `pr-media-<slug>` (pre-release) and embeds the `releases/download/...` URLs. Media stays in the git-ignored `.pr-media/`.
5. Learnings and docs sweep (section 8, and the documents that describe every path in `git diff --name-only main...HEAD`). "Nothing learned" and "no doc affected" are valid answers, stated out loud.
6. Merge sensitivity. The reviewer's blast radius and verdict go into the PR body verbatim; a sensitive PR gets its human checklist written before the PR opens.
7. Conventional Commit, push, `gh pr create` with `.github/pull_request_template.md`.
8. **E2E on CI only when it can catch something.** The automatic workflow (`verify.yml`) runs `checks`, `unit`, `docker` and `security` only; the E2E suite lives in `e2e.yml` and runs on manual dispatch (ADR 0018). Suggest the dispatch to the owner only when the diff can change what the suite exercises: product source under `apps/` or `libs/`, E2E specs or helpers, `playwright.config.ts`, `.github/workflows/e2e.yml`, `.github/actions/`, `.nvmrc`, dependencies or build configuration. Docs, agent tooling, unit tests and repository-shape tests merge on the green automatic run and the local `/verify`; never suggest the dispatch for them, even when they live under `apps/` or `libs/`. When the owner asks for it, dispatch it for the branch head (`gh workflow run e2e.yml --ref <branch>`), wait for it (`gh run watch <id> --exit-status`) and merge only when it and the automatic run are green. A red E2E run goes back to Build.

9. **Scenarios before the merge.** `/open-pr` matches the diff against the `paths` of every `docs/scenarios/*.md` and names the scenarios to run with `/scenario <slug>`; the owner decides. A scenario boots the whole stack on its own ports with the fake model and walks the product's core with one browser per author, hunting edge cases; a defect it finds goes back to Build with a regression test, never an inline fix (ADR 0023).

**CI runs.** GitHub sometimes creates no `verify` run for a push or a pull request. When the head has no run, dispatch one (`gh workflow run verify.yml --ref <branch>`) instead of pushing an empty commit. Never poll the GitHub API in a loop: tight polling trips the secondary rate limit. Wait with `gh run watch <id> --exit-status`, one call per run, or a scheduled wakeup.

**Merge on green.** When the owner asks to merge as soon as CI is green, merge, then land the tester's ticks and evidence in a `docs` follow-up PR.

**Image proof without Docker.** When the diff touches `docker/` or `deploy/` and the doctor reports Docker missing, the agent either asks to install it or writes in the PR body that the image was proven by the `docker` job of CI only. Never silently.

The PR body links the feature folder, the ADRs it depends on and the learnings it produced.

**Sensitive PRs.** A PR is sensitive when its tier is 🟡 or 🔴, or when the diff touches auth or sessions, sharing or authorization, the update log or the projection, schema or migrations, deploy files, data deletion or secrets handling. The reviewer decides: `Merge sensitivity: LOW | MEDIUM | HIGH`, and MEDIUM or HIGH means sensitive. Every PR body carries the verdict with its reason. A sensitive PR also carries a **Blast radius** section (what can break and for whom, who notices first, how to roll back, whether rollback loses data) and ends with a **Human checklist**: the checks a person runs by hand before merging, one box each, concrete enough to execute without the agent (open X as Y, expect Z; run the rollback once; confirm the migration on a copy of production data). The agent writes the checklist, never ticks it, and never lowers the reviewer's verdict.

## 8. Learn

`learning` skill → `docs/learnings/YYYY-MM-DD-<slug>.md`:

```
# <Trap, stated as the symptom you will see again>
- Date: YYYY-MM-DD
- Inspired by: <ADR, PR, test, incident or doc that surfaced it>
- Revisited: YYYY-MM-DD — <still true | changed because …>   (append one line per revisit)

## Signal   what you actually see when it bites
## Cause    one paragraph
## Do       the move that avoids it
## Anchor   file paths, commits, test names
```

Write one immediately when: diagnosis took more than fifteen minutes; a failure the failure-modes table did not predict; a doc or vendor API contradicted reality; a hook surprised you. Revisit every learning touched by a change and append the `Revisited` line. Promote in the same change that taught you: a fact → `rules/`, a process → this file, a mechanical check → a hook, a repeatable procedure → a skill. `docs/learnings/README.md` indexes by area.

## 8b. Context economy

Tokens are spent where judgment is needed, not on re-reading documents.

- The orchestrating agent does not read `plan.md` or `test-plan.md` in full on its own initiative. It reads the section it is about to act on, or the status summary at the top, and hands sub-agents the exact excerpt they need inside the prompt.
- `developer` receives its group's steps in the prompt and the spec sections they depend on. It does not open the whole plan, the test plan or other features' folders.
- `tester` reads `test-plan.md` because executing it is the job, plus `tester-briefing.md`. It does not read `plan.md`.
- `reviewer` reads the diff, `spec.md` and the ticked summary of `test-plan.md`. It opens `plan.md` only to check a struck-through step.
- `researcher` reads code, rules, ADR titles and learnings index; it opens an ADR or learning body only when its title matches the task.
- Domain rules in `.claude/rules/` load by `paths:` globs in Claude Code; other tools open the rules whose globs match the files they edit, as `AGENTS.md` says. The globs never match `docs/**`, so planning work does not pull them in.
- Bulk output (test runs, logs, sweeps) runs in a sub-agent that reports failures only. Small tasks that fit in three tool calls run inline; a sub-agent costs a full prompt before its first call.
- Status lives in one line at the top of `spec.md` and in the ticked boxes; nobody rewrites a summary that a `grep -c "\[x\]"` can produce.

## 9. Agents

Role bodies live in `.agents/roles/<role>.md`, one source. Claude Code reads the thin wrappers in `.claude/agents/`; Codex reads `.codex/agents/*.toml` (`features.multi_agent`). Any other tool: open the role file and paste it as the sub-agent's instructions.

| Role | Context | Owns | Never |
|---|---|---|---|
| `researcher` | read-only | finds reusable code, affected files, patterns, risks | writes code |
| `developer` | writes | disjoint paths named in the plan, unit tests, tester briefing | runs the test plan, claims it works |
| `tester` | fresh | executes `test-plan.md`, Playwright MCP walks, evidence, edge-case hunting | fixes product code |
| `reviewer` | fresh, read-only | conventions, security, refutation, verdict | posts to GitHub |
| `security-reviewer` | fresh, read-only | attacks the diff: sessions, authorization, share links, credentials, storage, secrets, supply chain | posts to GitHub, fixes code |
| `recorder` | writes media only | screenshots, video, ffmpeg, release upload, PR embeds | touches code |

Routing: bulk reading and sweeps → cheapest model; implementing a decided design → mid model; architecture, security review, "is this right" → strongest model. Small tasks that fit in three tool calls run inline.

## 10. Skills and commands

| Name | Kind | Use |
|---|---|---|
| `brainstorming` | skill (vendored) | every feature or fix starts here |
| `writing-plans` | skill (vendored) | produces `plan.md` from an approved spec |
| `executing-plans` / `subagent-driven-development` | skill (vendored) | runs the plan through developer sub-agents |
| `test-driven-development` | skill (vendored) | red → green → refactor |
| `systematic-debugging` | skill (vendored) | when stuck |
| `verification-before-completion` | skill (vendored) | before any "done" |
| `feature` | skill | scaffolds `docs/features/<slug>/` |
| `adr` | skill | scaffolds a numbered ADR |
| `learning` | skill | records or revisits a learning |
| `/verify` | skill | typecheck → security audit → secret scan → unit → E2E, stop at first failure |
| `/check-ui` | skill | Playwright MCP walk, screenshots, video, release upload |
| `/open-pr` | skill | the Ship gates, then the PR |
| `/scenario` | skill | boots the stack on 3200/3299 and walks one `docs/scenarios/<slug>.md` with one Playwright MCP server per author |

Vendored skills come from superpowers 6.4.1 (MIT); the `metadata` block in each `SKILL.md` says what was changed. Claude Code invokes a skill as `/<name>` with `$ARGUMENTS`; Codex as `$<name>` followed by the arguments in plain text.

## 11. Autonomy contract

**Decide alone:** file names inside the agreed layout, test names, internal helper shapes, the order of plan steps, which sub-agent model to use.
**Ask first:** anything in the spec, anything visible to the user, design-system choices, dependencies added, installing a tool on the machine (the doctor's fix: lines), schema changes, deleting data, commits and pushes, anything that costs money (LLM batch runs, deploys).
**Never:** edit `.env*`, `git add -A`, `--no-verify`, commit on `main`, post review findings to GitHub, mark a test-plan box without evidence, tick a human checklist box, lower a reviewer's merge sensitivity, call something done without running it.

## 12. Enforcement

| Hook | Event | Effect |
|---|---|---|
| `guard-secrets.sh` | PreToolUse Edit/Write | blocks edits to `.env*` except `*.example` |
| `guard-git-add-all.sh` | PreToolUse Bash | blocks `git add -A`, `git add .`, `--no-verify` |
| `doctor.sh` | SessionStart; `/verify` gate 0; CI `checks` | prints one line per tool the harness needs (`ok`, `missing` or `skipped`, required or optional, what is lost, the `fix:` for this platform's package manager); exit 1 when a required tool is missing. The session hooks force exit 0 so the report reaches the context |
| `warn-conventions.sh` | PostToolUse Edit/Write | warns on `?? `, `.js'` imports, `sleep`, comments other than `// NB ADR NNNN:`, `else {` in `.ts`/`.tsx` |
| `remind-docs.sh` | Stop | names the nearest README and the `.claude/rules/` files whose globs match each uncommitted change, when those documents did not change; each document once until the next commit |

The scripts live in `.agents/hooks/` and read the tool input from stdin, in the shape both tools send (`tool_input.file_path` from Claude Code, `apply_patch` headers in `tool_input.command` from Codex). Claude Code wires them in `.claude/settings.json`, Codex in `.codex/hooks.json`; `pnpm test:hooks` runs `.agents/hooks/hooks.test.sh` against both shapes and is part of `pnpm test:unit`. The two guards exit 2 with the doctor's fix line when jq is absent; a guard that becomes a no-op is not a guard.

Only unambiguous rules block. Judgment calls warn; a hook that fires on judgment calls trains you to ignore hooks. `remind-docs.sh` is the one judgment hook that blocks, because a warning at Stop never reaches the model: it names each document once until the next commit, never blocks a stop that is already continuing, and the agent may answer that nothing applies.

CI holds the mechanical half: `apps/server/src/repository-shape/delivery-docs.test.ts` fails when any README links a file or heading that no longer exists, or when a workspace package or `e2e/` has no README. `apps/server/src/repository-shape/readme-run-block.test.ts` fails when the root README's Run it block names a script, package filter, file, environment variable, demo user or port the sources do not have, or when any package or e2e README carries a fenced block, a `pnpm` or `docker` command or an environment variable. `agent-surfaces.test.ts` fails when a role under `.agents/roles/` lacks its Claude Code wrapper, its Codex wrapper or its Codex registration. The `security` job of `verify.yml` audits production dependencies at `high` (`pnpm security:audit`) and scans every commit on every branch and tag plus the checked-out tree with a checksum-pinned gitleaks binary, after `.github/scripts/secret-rules-probe.sh` proves the rules fire on a fresh token and stay silent on a shipped placeholder (`.gitleaks.toml` allowlists the exact placeholder strings, anchored); the repository's Dependabot alerts and automated security fixes are on, so a PR opens only for a vulnerable dependency with a fix ([ADR 0022](../docs/adr/0022-mechanical-security-gates-and-a-security-reviewer.md)).
