# The local gate fails only on a latency pin while every other test is green

- Date: 2026-10-18
- Inspired by: eight `pnpm verify` runs during the final-visuals, connection-state and room-admission integration, each red only on `ten thousand events build one pipeline per cursor and answer within the local latency budget` (`apps/server/src/history/timeline-routes.test.ts`) with values of 213 to 660 ms against the 150 ms budget, while the same file passed alone (28 of 28) minutes later

## Signal
`verify: unit failed` with exactly one failing test, the latency pin, and a load average above 10 on the machine: several testers' stacks, recorders' browsers and another worktree's gate were running at the same time. The pin is skipped on CI (`isContinuousIntegration`), so hosted runs never see it.

## Cause
The pin measures wall-clock latency of a local request. It is a performance budget, not a correctness test, and it reads the machine's load as a regression.

## Do
Rerun that file alone (`pnpm exec vitest run src/history/timeline-routes.test.ts` in `apps/server`) before reading the failure as a regression; run the full gate when no other heavy process shares the machine. Record the isolated run as the evidence when the gate is otherwise green. Do not raise the budget or skip the pin locally: it protects the latency goal of ADR 0001 (event sourcing over Yjs).

## Anchor
`apps/server/src/history/timeline-routes.test.ts` (the `isContinuousIntegration` guard around the budget assertion), `.agents/skills/verify/SKILL.md`
