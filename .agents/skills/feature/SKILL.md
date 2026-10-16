---
name: feature
description: Scaffolds docs/features/<slug>/ for any feature or fix. Use when starting any feature or fix, when the owner says "new feature", "fix", "vamos fazer", "start the plan", or after the brainstorming skill ends with an agreed direction.
metadata:
  author: in-house
  created: 2026-10-16
---
# Feature

Scaffold the feature folder. Process: `.claude/HARNESS.md` sections 1 and 3.

1. Get the slug. If the owner did not give one, ask. Kebab-case, no dates, no tier prefix. Stop until you have it.
2. Check `docs/features/<slug>/`. If it exists, refuse and say so. Never overwrite. Ask for another slug or whether the work belongs in the existing folder.
3. Copy all four files from `docs/features/_template/` into `docs/features/<slug>/`: `spec.md`, `plan.md`, `test-plan.md`, `tester-briefing.md`.
4. Set the tier in `spec.md` and `plan.md` from the brainstorm: 🟢 small, 🟡 medium, 🔴 structural. When in doubt, take the heavier tier. If the tier is unclear, ask.
5. Link every ADR the feature depends on in the `**ADRs:**` line. A decision with alternatives that has no ADR yet: run the `adr` skill first.
6. Fill the `# Title` and `**Status:** Draft`. Leave `**Owner approval:** pending`. Leave every checkbox empty.
7. Remind the owner, in one line each: spec approval precedes the plan, the plan precedes code, the test plan precedes the build.
8. Print the folder tree of `docs/features/<slug>/`.

If anything in the request is ambiguous (slug, tier, whether it is a fix or a feature), stop and ask. Do not guess.
