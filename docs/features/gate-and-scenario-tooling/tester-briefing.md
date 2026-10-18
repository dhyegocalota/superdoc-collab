# Tester briefing: Gate and scenario tooling

Tooling class: the lead ticks `test-plan.md` with the gate output. Every "it works" below is a hypothesis.

## What changed

- `.prettierignore` gains `e2e/_*` (`ed2105d`).
- `.github/scripts/secret-rules-probe.sh` uses two fixed constants, `github_lookalike_suffix` and `placeholder_lookalike_suffix` (`6ce2617`). A first draft named one `random_secret` and gitleaks flagged the script itself; the amended commit renamed both.
- `e2e/documents.spec.ts` gains "a new document accepts typing after a click" (`5b57d20`), a pin: it passed on its first run in 3.5 s.
- The scenario and its skill tell the author to click the first paragraph and press End before typing (`87cd68f`).
- A third MCP server `playwright-third`, allowed for the tester and recorder, and the one-line rule in both roles (`7762c27`).

## How to run

```
.github/scripts/secret-rules-probe.sh "$(command -v gitleaks)"
gitleaks dir --no-banner --redact --exit-code 1 -c .gitleaks.toml .github/scripts
pnpm typecheck
```

The E2E is part of the gate's E2E run, or alone with a scratch copy of `playwright.config.ts` on free ports.

## Red today, green after

None: the E2E is a pin, the probe change removes a flake, the rest is configuration and text. The `random_secret` finding above is the one failure seen while building.

## Hypotheses to attack

1. The probe still fails closed: a fresh token and a random secret are reported, the shipped placeholder is silent.
2. `gitleaks` reports nothing in `.github/scripts`.
3. The blank-document spec does not flake under parallel workers (it clicks at a fixed offset inside the first page).
4. A session with only two MCP servers still works.

## Known gaps

- The click offset is a coordinate, not an element, so a layout change could miss the first paragraph.
- The hang on `browser_close` is not reproduced or fixed; the spare is a mitigation only.
