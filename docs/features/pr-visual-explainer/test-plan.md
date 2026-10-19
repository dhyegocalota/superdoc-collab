# Test plan: Every PR carries a visual explainer

Tooling change: the gate output and the reviewer are the proof (HARNESS §5).

- [ ] `pnpm verify` on the branch green, hooks gate included
- [ ] The PR body's Visual explainer section has one row per user-visible change and a Mermaid diagram per data-flow change (reviewer check)
