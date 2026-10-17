---
name: open-pr
description: Ship gate — verify, test plan evidence, reviewer verdict, PR media, learnings and docs sweep — then Conventional Commit, push and gh pr create. Stops at the first gate that fails.
argument-hint: <feature-slug> [--draft]
allowed-tools: Bash(git:*), Bash(gh:*), Bash(pnpm:*), Bash(ls:*), Bash(cat:*), Read, Edit, Agent
---

Feature slug: first token of `$ARGUMENTS`. The folder `docs/features/<slug>/` must exist with `spec.md`, `plan.md`, `test-plan.md` and `tester-briefing.md`, or with `spec.md` alone when it says `**Lane:** docs`; otherwise stop and say which is missing.

## Pre-flight

- Current branch is `feat/`, `fix/`, `docs/` or `chore/`; never `main`. Create one if needed.
- `spec.md` says `Owner approval: approved <date>`. Not approved → stop.
- Run `pnpm verify --plan` and keep its `class:` line. A spec that says `**Lane:** docs` with a class other than `docs` → stop: the change left the docs lane (HARNESS §1).
- Detect mode: an open PR for this branch (`gh pr view --json number,url`) means **update**, otherwise **create**.

## Gates, in order, stop at the first failure

1. **Verify.** Run `/verify`. Any failure → stop.
2. **Test plan.** Docs lane → skip. Otherwise every box in `test-plan.md` is ticked with ` — evidence: ` or marked `BLOCKED: <why>`. Any bare `- [ ]` → stop and name them. Class `product`: the ticks must have been written by the `tester` sub-agent; if the plan was ticked by whoever built it, stop and dispatch the tester. Class `tooling` (and a behaviour-preserving refactor): the lead ticks with the gate output as evidence and the reviewer refutes them (ADR 0028).
3. **Review.** Dispatch the `reviewer` sub-agent on `git diff main...HEAD` with the feature folder as context; on the mid model in the docs lane. Verdict `NO` → fix the findings through the plan and rerun from gate 1. `WITH RESERVATIONS` → list them to the owner and wait for an explicit go. `YES` → continue. Keep the reviewer's `Blast radius` and `Merge sensitivity` lines for the PR body.
3b. **Security review.** Docs lane (the spec says `**Lane:** docs` and the class is `docs`) → write `Security verdict: NOT APPLICABLE — docs lane: <the paths checked>` yourself. Otherwise dispatch the `security-reviewer` sub-agent on `git diff main...HEAD` with `spec.md` as context. `FINDINGS` with any `CRITICAL` or `IMPORTANT` → fix through the plan and rerun from gate 1. `MINOR` only → list them to the owner and continue. Keep the verdict line for the PR body.
4. **Media.** If the diff touches `apps/web/**` or any user-visible behaviour: `.pr-media/<slug>/` must contain at least one screenshot and `walkthrough.mp4`; otherwise run `/check-ui <route> <slug> --video` first. Dispatch the `recorder` role to upload to the `pr-media-<slug>` pre-release and return the Markdown block.
5. **Learnings and docs sweep.** Ask: did anything take more than fifteen minutes to diagnose, contradict a doc, or surprise a hook? Record with the `learning` skill, and revisit every learning whose Anchor paths appear in the diff (append the `Revisited` line). Then, for every path in `git diff --name-only main...HEAD`, read the nearest `README.md` and the `.claude/rules/` files whose globs match it, and fix any fact the diff made wrong. "Nothing learned" and "no doc affected" are valid answers stated in the PR body.
6. **ADRs.** Any decision with alternatives made during this work has an ADR with status set. Otherwise stop and write it.
7. **Merge sensitivity.** `LOW` → the body states the verdict and its reason, and drops the Blast radius and Human checklist sections. `MEDIUM` or `HIGH` → the body carries the reviewer's blast radius verbatim and ends with a Human checklist: the hand checks a person runs before merging, one box each, concrete (open X as Y, expect Z; run the rollback once), every box left empty.

## Commit and PR

- Stage files by name (`git add <paths>`); never `-A`, `.` or `--all`. Never `--no-verify`.
- Conventional Commit, en-US: `type(scope): summary`, body explains why, ends with the attribution line the agent harness requires.
- Push with `-u` on first push.
- Body from `.github/pull_request_template.md`, every section filled: Summary, Decisions (ADR links), Video (`.mp4` URL on its own line, gif fallback), Screenshots table, Test plan summary with link, Review verdict and fixed findings, Security verdict and fixed findings, Learnings, Not changing, Merge sensitivity, Blast radius and Human checklist when sensitive, Checklist ticked honestly. The Human checklist is always the last section. The docs lane drops Video, Screenshots and Test plan.
- Create: `gh pr create --base main --title "<type>(<scope>): <summary>" --body-file <file>` (`--draft` when asked). Update: `gh api repos/{owner}/{repo}/pulls/<n> -X PATCH --field body=@<file>`.
- Reply with the PR URL and the gate summary (verify class and gates, test plan N/N, reviewer verdict, security verdict, media assets, learnings).

## Merge

The gate is local (ADR 0028): hosted runs are not waited for. Never run a scenario before the PR opens. When the owner asks for the merge:

0. Read the `paths` front matter of every `docs/scenarios/*.md` and match the globs against `gh pr diff <n> --name-only`; name each scenario that matches and suggest `/scenario <slug>` to the owner, who decides (ADR 0023). When none matches, say so in one line.
1. `git fetch origin`, merge `origin/main` into the branch (never rebase) and run `/verify`. It runs only what `origin/main` brought in that the branch's last green commit did not cover.
2. Post the verify summary (class, gates with times, commit) as a PR comment with `gh pr comment <n> --body-file <file>`.
3. Green → push the branch, `git fetch origin` again and confirm `git merge-base --is-ancestor origin/main HEAD`; when `main` moved, go back to step 1. Then merge the way the owner asked (`gh pr merge <n> --merge`). Red → back to Build.
4. Report the comment URL and the merge commit in the reply.

All PR text in English. Review findings never go to GitHub; only the verdict summary does.
