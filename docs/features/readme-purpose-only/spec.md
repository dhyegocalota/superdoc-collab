# README purpose only — spec

- Status: Shipped 2026-10-17
- Tier: green (documentation and one repository-shape test; no product code).
- Owner approval: approved 2026-10-17 ("não acho legal manter, nem comando, nem configurações, a não ser que seja extremamente necessário e que você tenha harness engineering rules para atualizar toda vez que mudar").
- Not changing: product code, the link checker, the Stop hook.

## Problem

Commands, ports and environment variables in a README go stale silently: code is compiled and tested on every change, prose is not.

## Goals

- Every package README and `e2e/` README states purpose only: no scripts, ports, environment variables, `pnpm`, `docker` or `gh` commands, or file paths.
- The root README's Run it section is the one exception, because a repository-shape test pins every script, package filter, file, environment variable, demo user, password and local port it mentions to the real sources.
- The harness rules say so in `AGENTS.md` and `.claude/HARNESS.md`.

## Non-goals

- Feature folders, ADRs and learnings keep their commands; they are history.
