# Cleanup: remove the POC and keep READMEs free of code — spec

- Status: Shipped 2026-10-17
- Tier: green (files removed and documentation rewritten; no product code).
- Owner approval: approved 2026-10-17 (the owner asked: "Clean up files (remover poc, simplificar README ao máximo (e.g., um big screenshot), remover referência de código de READMEs… pois código compila e falha em mudanças, mas README fica outdated)"), with "pode push direto na main".
- ADRs: 0001–0005 and 0007 cite the POC; their links become plain text.
- Not changing: product code, tests, the link checker, the Stop hook.

## Problem

`poc/` weighed 542 MB with build output and duplicated the history library it had proven. The root README ran to 200 lines and every package README carried a table of source paths and symbols; code is compiled and tested on every change, prose is not, so those references were the first thing to go stale.

## Goals

- `poc/` is gone; every live instruction file (`AGENTS.md`, `.claude/rules/*`, skills, roles) and ADR says where its evidence now lives instead of linking it.
- The root README is one screen: pitch, live demo, one screenshot, how to run, where to read more, licence. Its former sections live in `docs/architecture.md` and `docs/credits.md`.
- Package READMEs state purpose, commands and configuration only, with no link or reference to a source file, folder or symbol.
- The screenshot is a real capture of the built app at 1440 × 900 (two authors, four topics), produced by a scripted Playwright run.

## Non-goals

- Feature folders and learnings keep their plain-text mentions of POC files; they are history.
- No change to `.claude/rules/*` facts beyond the POC citations note.
