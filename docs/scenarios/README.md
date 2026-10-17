# Scenarios

Agentic walks of the product's core in real browsers, one file per flow, run with `/scenario <slug>` ([ADR 0023](../adr/0023-agentic-scenario-runs-with-one-browser-per-author.md)). A scenario boots the whole stack on its own ports with the fake model, drives every author through its own Playwright MCP server, runs every test, hunts the edge cases listed and any found, and reports pass/fail with screenshots under `.pr-media/scenario-<slug>/`.

Before a merge, `/open-pr` names the scenarios whose `paths` the diff touches; the owner decides whether to run them.

| Scenario | Authors | Covers |
|----------|---------|--------|
| [`core-realtime`](core-realtime.md) | 2 | two authors converge, attribution on the timeline, reload, offline merge, read-only links, time travel, concurrent deletes, a burst paste |

## File shape

Front matter: `name`, `title`, `authors` (how many Playwright MCP servers the run needs), `paths` (globs, the same shape as `.claude/rules/`). Body: `## Setup`, `## Tests` with one `### Tn <title>` per test and exactly one `Expect:` line each, `## Edge cases to hunt during the run`. `apps/server/src/repository-shape/scenarios.test.ts` checks the shape and that this index lists every file.
