# Plan: Gate and scenario tooling

**Spec:** spec.md
**Tier:** 🟢
**Seam:** the gate scripts, the scenario skill and the MCP server list.
**Assumptions (decided, owner can override):**
- The spare server is a plain copy of the other two; nothing selects it automatically.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `.prettierignore`, `.github/scripts/secret-rules-probe.sh`, `e2e/documents.spec.ts`, `docs/scenarios/core-realtime.md`, `.agents/skills/scenario/SKILL.md`, `.mcp.json`, `.codex/config.toml`, `.agents/roles/tester.md`, `.agents/roles/recorder.md`, `.claude/agents/tester.md`, `.claude/agents/recorder.md`, `docs/features/gate-and-scenario-tooling/`, `docs/learnings/` | `developer-ss` |

## Sequencing

One group.

## Steps

### G1

- [x] **Step 1:** `.prettierignore` ignores `e2e/_*`. — evidence: ed2105d
- [x] **Step 2:** fixed probe constants; run the probe three times. — evidence: 6ce2617
- [x] **Step 3:** the blank-document E2E, run once against the real app. — evidence: 5b57d20
- [x] **Step 4:** the scenario typing step in the scenario and its skill. — evidence: 87cd68f
- [x] **Step 5:** the spare MCP server and the role rule. — evidence: 7762c27
- [x] **Step 6:** this folder, the learning and the index rows; tester briefing.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | a constant name or value trips gitleaks on the script itself | `gitleaks dir .github/scripts` exits 1 | rename or reshape the constant |
| 3 | the click position misses the page in a narrow layout | the spec fails waiting for focus | click the page element, not a coordinate |
| 5 | the session started before `.mcp.json` changed has no third server | the tools are absent | restart the session; the old two keep working |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Test plan:** the lead ticks it with the gate output (tooling, ADR 0030).
