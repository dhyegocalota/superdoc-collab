---
name: scenario
description: Boots the whole stack on its own ports with the fake model and walks one docs/scenarios/<slug>.md in real browsers, one Playwright MCP server per author, hunting edge cases and reporting pass/fail with screenshots. Run before a merge when /open-pr names the scenario; never before the PR opens.
argument-hint: <slug>
allowed-tools: Bash(pnpm:*), Bash(curl:*), Bash(kill:*), Bash(ls:*), Bash(cat:*), Bash(mkdir:*), Bash(git diff:*), Read, Write, mcp__playwright__*, mcp__playwright-second__*, mcp__playwright-third__*
metadata:
  author: in-house
  created: 2026-10-17
---
# Scenario

Process: `.claude/HARNESS.md` §5 and §7 step 9; decision: ADR 0023. One scenario file, every author in its own browser, every `Expect` asserted on what the user sees.

## Steps

1. **Pick the scenario.** `$ARGUMENTS` is the slug. Read `docs/scenarios/<slug>.md`. An unknown slug → list `docs/scenarios/` and stop. Read `authors` from the front matter: author A drives `mcp__playwright__*`, author B drives `mcp__playwright-second__*`. A server whose tools are absent in this session → stop and say which server to add to `.mcp.json` (and that it loads at the next session start); never fall back to two tabs of one browser, they share the session.
2. **Boot.** `pnpm scenario:stack` in the background (`run_in_background`). Wait for its `ORIGIN=` and `PID=` lines (ports 3200 and 3299, fresh database, demo users with password `superdoc-demo`, the fake model). A busy port is named in the error: stop the process that holds it, never pick another port by hand.
3. **Set up.** Follow `## Setup` of the scenario: each author signs in through the form at `<ORIGIN>/sign-in` on its own server, never by injecting cookies. Screenshots go to `.pr-media/scenario-<slug>/<nn>-<test>-<author>.png`, lowercase and dashes. After New document, wait for the editor surface, click the first paragraph and press End, then type with keyboard presses (`browser_press_key`, or `browser_type` with `slowly: true` after the click); never fill a blank surface, which leaves no selection and SuperDoc rejects the first key.
4. **Run every test in order.** For each `### Tn`: perform the steps on the named author, then assert the `Expect` on what each author sees (`browser_snapshot`, text, counts, states), with a screenshot per author at the moment of the assertion. A failing `Expect` is a FAIL with the observed value; the run continues with the next test unless `## Setup` itself failed. Never retry a step to make it pass; a flaky step is a finding.
5. **Health per test.** `browser_console_messages` at error level and `browser_network_requests` on both authors; anything other than the exceptions the scenario names is a finding.
6. **Hunt.** Try every item under `## Edge cases to hunt during the run` and anything the run suggests. Each new case gets a line in the report with input and observed outcome.
7. **Report.** Write `.pr-media/scenario-<slug>/report.md`: one row per test (`PASS | FAIL`, evidence path, observed value when FAIL), the edge cases hunted, defects with reproduction steps, console and network findings, the stack's `DATABASE_DIR`. Reply with the same table and the defect list. A defect never gets fixed here: it becomes a learning or a fix feature with a regression test.
8. **Stop the stack.** `kill -TERM <PID>` with the `PID=` the stack printed (the script's own process; it kills the fake model's and the server's process groups); confirm `curl --silent --max-time 2 <ORIGIN>/api/health` no longer answers. Close both browsers.

`.pr-media/` is git-ignored; copy the result table into the feature's `test-plan.md` when a feature asked for the run. Everything in English.
