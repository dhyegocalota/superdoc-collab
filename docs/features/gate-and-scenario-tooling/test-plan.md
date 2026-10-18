# Test plan: Gate and scenario tooling

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts). Tooling change: the lead ticks with the gate output and the reviewer refutes (ADR 0030).

## Format

- [ ] A throwaway `e2e/_walk-x.spec.ts` with bad formatting — expected: `pnpm format` (or the gate's `format` step) does not report it

## Secret probe

- [ ] `.github/scripts/secret-rules-probe.sh "$(command -v gitleaks)"` three times — expected: each prints `secret rules: near misses reported, shipped placeholder silent` and exits 0
- [ ] `gitleaks dir --exit-code 1 -c .gitleaks.toml .github/scripts` — expected: exit 0 (the constants are not reported)

## Blank-document E2E

- [ ] `e2e/documents.spec.ts::a new document accepts typing after a click` — steps: sign in, New document, wait for the editor, click the page, End, type one sentence, reload; expected: the sentence renders before and after the reload — evidence: the gate's E2E run
- [ ] First run against the real app — expected: green in a few seconds (a pin: it covers behaviour that already worked) — evidence: `5b57d20` passed in 3.5 s

## Scenario and MCP

- [ ] `docs/scenarios/core-realtime.md` Setup and `.agents/skills/scenario/SKILL.md` step 3 each tell the author to click the first paragraph and press End before typing, with key presses — expected: both texts say it in one sentence
- [ ] `.mcp.json` parses and lists `playwright`, `playwright-second`, `playwright-third` identically; `.codex/config.toml` has the same three — expected: three servers, same command and arguments
- [ ] `.agents/roles/tester.md` and `recorder.md` carry the `browser_close` and one-minute rule — expected: one line each

## Typecheck

- [ ] `pnpm typecheck` — expected: green

## Adversarial review

- [ ] Claim 1: the fixed probe constants cannot flake — attack: run the probe repeatedly on a loaded machine; result:
- [ ] Claim 2: the spare server changes nothing for sessions that do not use it — attack: start a session with only two servers; result:

## Coverage honesty

- The fixed tokens are pinned by the probe's own pass; entropy is not asserted separately.
- No test proves that `browser_close` stops hanging; the spare is a mitigation.
