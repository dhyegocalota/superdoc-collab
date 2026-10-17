# E2E on CI only when it can catch something — spec

- Status: Building
- Tier: green (process docs only).
- Owner approval: approved 2026-10-17 ("é pra vc alterar os arquivos de harness engineering que sugere rodar e2e no github antes de merge um pr … só é pra sugerir se fizer sentido").
- ADRs: [0018](../../adr/0018-fan-out-ci-and-prebuild-the-projection-worker.md), unchanged: it already makes the CI E2E run the one the owner asks for.
- Not changing: `e2e.yml`, `verify.yml`, the local `/verify` gate, ADR 0018.

## Problem

HARNESS §7 step 8 and the `open-pr` Merge section told the agent to dispatch the CI E2E suite before every merge and never to merge on the local run alone. So the agent suggested a slow, billed run even for PR #19, which touched only docs and agent tooling.

## Change

- HARNESS §7 step 8, the `open-pr` Merge section and `e2e/README.md`: suggest the dispatch only when the diff can change what the suite exercises (product code under `apps/` or `libs/`, E2E specs or helpers, `playwright.config.ts`, dependencies, the build or runtime configuration). Docs, agent tooling and repository-shape tests merge on the green automatic run and the local `/verify`.
- When the owner asks for the run, the dispatch-and-wait steps are unchanged.
