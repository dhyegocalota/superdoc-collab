# Plan: Agentic history over MCP

**Spec:** spec.md
**Tier:** 🔴
**Seam:** <the boundary where this feature plugs into existing code>
**Assumptions (decided, owner can override):**
- <assumption>

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `<paths>` | `developer-1` |
| G2 | `<paths>` | `developer-2` |
| G3 | `<paths>` | `developer-3` |

## Sequencing

<Which groups run in parallel, which wait for which, and why.>

## Steps

Author this list with every box empty. A sub-agent ticks its own line. A wrong step is struck through with the reason, not deleted.

### G1

- [ ] **Step 1:** <failing test first, then the change>
- [ ] **Step 2:** <step>

### G2

- [ ] **Step 3:** <step>

### G3

- [ ] **Step 4:** <step>

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1    |             |                                    |                |

**Steps with no backout:** <step numbers and names, or "none">

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded (only if UI was touched).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
