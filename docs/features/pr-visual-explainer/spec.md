# Every PR carries a visual explainer

**Status:** Shipped 2026-10-19
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner's request, translated: "every time you open a PR, it must have a visual explainer for humans of those changes")
**Not changing:** the media recording, the reviewer contract, the gate order

## Change

- `.github/pull_request_template.md` gains a `## Visual explainer` section before Video: a table with one row per user-visible change (annotated screenshot or before/after pair, one sentence) and a Mermaid block for each data-flow change; a server-only PR writes "No user-visible change" and still draws its data flow.
- `.claude/HARNESS.md` section 7 gate 4 requires it on every PR and asks the reviewer to check it against the diff.
- `.agents/skills/open-pr/SKILL.md` step 4 fills it before the media step and refuses a body that still carries the template placeholder.
- This PR applies it.

## Test list

- Class tooling: `pnpm verify` hooks gate; `tools/repository-shape` agent-surfaces test stays green (the skill file keeps its front matter).
