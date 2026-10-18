# Test plan: Gate and scenario tooling

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts). Tooling change: the lead ticks with the gate output and the reviewer refutes (ADR 0030).

## Format

- [x] A throwaway `e2e/_walk-x.spec.ts` with bad formatting — expected: `pnpm format` (or the gate's `format` step) does not report it — evidence: lead at 05e167b — a throwaway `e2e/_walk-x.spec.ts` with `const   x = {a:1}` left `prettier --check` reporting no file (ignored), and the gate's format stage passed with the file absent (tool-verify-1.log, `verify: format ok`)

## Secret probe

- [x] `.github/scripts/secret-rules-probe.sh "$(command -v gitleaks)"` three times — expected: each prints `secret rules: near misses reported, shipped placeholder silent` and exits 0 — evidence: lead at 05e167b — three runs printed `secret rules: near misses reported, shipped placeholder silent`, exit 0 each; the gate's secrets stage passed
- [x] `gitleaks dir --exit-code 1 -c .gitleaks.toml .github/scripts` — expected: exit 0 (the constants are not reported) — evidence: lead at 05e167b — `gitleaks dir --no-banner --exit-code 1 -c .gitleaks.toml .github/scripts` exit 0

## Blank-document E2E

- [x] `e2e/documents.spec.ts::a new document accepts typing after a click` — steps: sign in, New document, wait for the editor, click the page, End, type one sentence, reload; expected: the sentence renders before and after the reload — evidence: the gate's E2E run — evidence: gate at 05e167b — `e2e/documents.spec.ts:191 a new document accepts typing after a click` passed in 3.9 s inside the full suite (98 of 98, tool-verify-1.log)
- [x] First run against the real app — expected: green in a few seconds (a pin: it covers behaviour that already worked) — evidence: `5b57d20` passed in 3.5 s — evidence: 5b57d20 passed in 3.5 s on the developer's run and 3.9 s in the gate

## Scenario and MCP

- [x] `docs/scenarios/core-realtime.md` Setup and `.agents/skills/scenario/SKILL.md` step 3 each tell the author to click the first paragraph and press End before typing, with key presses — expected: both texts say it in one sentence — evidence: lead at 05e167b — both files carry the click-then-End-then-key-presses sentence once (`grep -c End` 1 and 1)
- [x] `.mcp.json` parses and lists `playwright`, `playwright-second`, `playwright-third` identically; `.codex/config.toml` has the same three — expected: three servers, same command and arguments — evidence: lead at 05e167b — `.mcp.json` lists playwright, playwright-second, playwright-third with identical definitions (json compare), `.codex/config.toml` names playwright-third
- [x] `.agents/roles/tester.md` and `recorder.md` carry the `browser_close` and one-minute rule — expected: one line each — evidence: lead at 05e167b — `browser_close` appears once in each role body

## Web test timeout

- [ ] `apps/web/src/features/versions/time-travel.test.tsx` — expected: 32 of 32 pass with the five-second `asyncUtilTimeout` (a pin: it passed alone at the commit) — evidence: the gate's unit run under load

## Typecheck

- [x] `pnpm typecheck` — expected: green — evidence: gate at 05e167b — `verify: typecheck ok in 2s`

## Adversarial review

- [ ] Claim 1: the fixed probe constants cannot flake — attack: run the probe repeatedly on a loaded machine; result:
- [ ] Claim 2: the spare server changes nothing for sessions that do not use it — attack: start a session with only two servers; result:

## Coverage honesty

- The fixed tokens are pinned by the probe's own pass; entropy is not asserted separately.
- No test proves that `browser_close` stops hanging; the spare is a mitigation.
