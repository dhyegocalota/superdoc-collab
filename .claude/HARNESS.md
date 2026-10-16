# HARNESS — how work happens in this repo

**Placement rule.** An imperative about *how to work* belongs here. A fact that *describes the system* belongs in `.claude/rules/<domain>.md`. A *decision* and its alternatives belong in `docs/adr/`. A *trap* belongs in `docs/learnings/`.

```
AGENTS.md            facts and conventions, pointers to this file          (CLAUDE.md, GEMINI.md link here)
.claude/HARNESS.md   this file: the process
.claude/rules/       domain facts loaded by path
.agents/roles/       agent role bodies (one source for .claude/agents and .codex/agents)
.agents/skills/      skills: vendored superpowers subset + feature, adr, learning
.claude/commands/    /verify, /check-ui, /open-pr
docs/features/<slug> spec.md + plan.md + test-plan.md for every feature or fix
docs/adr/            decisions            docs/learnings/   dated traps
```

The process is tool-agnostic. Claude Code, Codex and any agent that reads `AGENTS.md` follow the same phases; only the mechanics of spawning sub-agents differ (see Agents).

## 0. Invariants

1. Nothing is built before the owner and the agent agree on 100% of the design. Agreement is explicit, in writing, in the spec.
2. Every feature **and every fix** gets `docs/features/<slug>/` with `spec.md`, `plan.md` and `test-plan.md`. Never one without the others. A fix's spec may be ten lines; it still exists.
3. Executing the test plan is the priority. A plan whose test plan is not run is not done.
4. The agent that builds never runs the test plan. The tester is a different sub-agent with a fresh context.
5. Every PR is reviewed by a reviewer sub-agent before it opens. There is always a reviewer.
6. Every PR that touches UI carries screenshots and a playable video recorded through Playwright MCP, hosted as GitHub Release assets and embedded in the body.
7. Every decision with alternatives becomes an ADR before the code that depends on it.
8. Everything in the repo is in English.
9. Tests are mandatory. No `sleep`. No `?? default`. No comments. See `AGENTS.md` → Code conventions.

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
- `test-driven-development` skill: failing test first, confirm it fails for the right reason, minimal code, green, refactor.
- Developers may run unit tests and typecheck for their own loop. They never run `test-plan.md` and never declare the feature works.
- When a developer finishes, it writes a **tester briefing** into `docs/features/<slug>/tester-briefing.md`: what changed, how to run it, which tests are red today and green after, and every "it works" stated as a hypothesis.
- Stuck after three honest attempts → `systematic-debugging` skill, then escalate to the owner with evidence.

## 5. Prove

- A `tester` sub-agent, never the developer, with a fresh context, executes `test-plan.md` end to end and ticks boxes with evidence (commit hash, log path, counts, screenshot path).
- Browser work runs through **Playwright MCP** from the user's perspective: walk the whole flow, not the changed screen; assert what the user sees; take the unhappy paths on purpose; read console and network; cover empty, single and many; both desktop and narrow widths; multi-author flows open one browser context per author.
- Edge cases are hunted during execution, not only listed upfront. New ones found go into `test-plan.md` and get a regression test.
- Any bug found returns to Build. The tester never fixes product code.
- `verification-before-completion` skill before anything is called done: run it, read the output, then claim it.

## 6. Review

- A `reviewer` sub-agent, with a fresh context, reviews the diff before the PR opens: conventions (`AGENTS.md`, `.claude/rules/`), correctness, security (auth, session tokens on sockets, SQL binding, enumeration-safe auth responses, secrets, path traversal on uploads, DOCX size limits, tenant isolation per document), performance budgets from the ADRs, and tests. It also tries to **refute** the tester: pick the three claims most likely to be wrong and attack them.
- Output: numbered findings `CRITICAL | IMPORTANT | MINOR`, each with file:line, the rule, the production consequence and a minimal fix; closing with `Ship-ready? YES | NO | WITH RESERVATIONS`.
- Findings are delivered in chat and fixed before the PR. The reviewer never posts to GitHub.

## 7. Ship

`/open-pr` runs the gates in order and stops at the first failure:

1. `/verify`: typecheck → unit → E2E.
2. `test-plan.md` fully ticked by the tester, with evidence.
3. Reviewer verdict `YES` (or `WITH RESERVATIONS` acknowledged by the owner).
4. UI touched → `/check-ui` recorded: the `recorder` role captures screenshots and a `recordVideo` walk, converts with ffmpeg to `.mp4` and `.gif`, uploads to the GitHub Release `pr-media-<slug>` (pre-release) and embeds the `releases/download/...` URLs. Media stays in the git-ignored `.pr-media/`.
5. Learnings sweep (section 8). "Nothing learned" is a valid answer, stated out loud.
6. Conventional Commit, push, `gh pr create` with `.github/pull_request_template.md`.

The PR body links the feature folder, the ADRs it depends on and the learnings it produced.

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
- Domain rules in `.claude/rules/` load by `paths:` globs; they never match `docs/**`, so planning work does not pull them in.
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
| `/verify` | command | typecheck → unit → E2E, stop at first failure |
| `/check-ui` | command | Playwright MCP walk, screenshots, video, release upload |
| `/open-pr` | command | the Ship gates, then the PR |

Vendored skills come from superpowers 6.4.1 (MIT); the `metadata` block in each `SKILL.md` says what was changed.

## 11. Autonomy contract

**Decide alone:** file names inside the agreed layout, test names, internal helper shapes, the order of plan steps, which sub-agent model to use.
**Ask first:** anything in the spec, anything visible to the user, design-system choices, dependencies added, schema changes, deleting data, commits and pushes, anything that costs money (LLM batch runs, deploys).
**Never:** edit `.env*`, `git add -A`, `--no-verify`, commit on `main`, post review findings to GitHub, mark a test-plan box without evidence, call something done without running it.

## 12. Enforcement

| Hook | Event | Effect |
|---|---|---|
| `guard-secrets.sh` | PreToolUse Edit/Write | blocks edits to `.env*` except `*.example` |
| `guard-git-add-all.sh` | PreToolUse Bash | blocks `git add -A`, `git add .`, `--no-verify` |
| `warn-conventions.sh` | PostToolUse Edit/Write | warns on `?? `, `.js'` imports, `sleep`, `// ` comments, `else {` in `.ts`/`.tsx` |

Only unambiguous rules block. Judgment calls warn; a hook that fires on judgment calls trains you to ignore hooks.
