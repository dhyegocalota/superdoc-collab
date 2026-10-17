# GitHub Actions may create no run for a push or PR, and tight API polling trips the secondary rate limit

- Date: 2026-10-17
- Inspired by: the UX lane: no `verify` run for three heads in a row (`fb5b66b` among them, nudged by the empty commit `c70af6f`), then `7da5a00` added `workflow_dispatch`; agents waiting on runs with `gh api` loops hit the secondary rate limit the same afternoon
- Revisited: 2026-10-17

## Signal
A pushed head has no `verify` check at all, neither queued nor running, so a merge gate waits forever. Later `gh` calls answer 403 "You have exceeded a secondary rate limit" and every agent sharing the token stalls.

## Cause
GitHub occasionally skips creating a workflow run for a `push` or `pull_request` event; nothing in the repository causes it and nothing retries it. Polling `gh run list` or `gh api` every few seconds from several agents exceeds the per-token secondary limit, which throttles all of them.

## Do
When a head has no `verify` run after a minute, dispatch one: `gh workflow run verify.yml --ref <branch>`. Never push an empty commit to nudge it. Wait on a run with `gh run watch <id> --exit-status`, one call per run, or a scheduled wakeup; never poll in a loop. Promoted to `.claude/HARNESS.md` section 7.

## Anchor
`.github/workflows/verify.yml` (`workflow_dispatch`), `.claude/HARNESS.md` → Ship → CI runs, commits `c70af6f`, `7da5a00`
