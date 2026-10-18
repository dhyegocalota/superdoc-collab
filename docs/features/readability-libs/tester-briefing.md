# Tester briefing: Readability in the libraries

Written by the developer. No tester runs this lane; the reviewer and `pnpm verify` prove it.

## What changed

Filled in when the steps are done.

## How to run

Run each touched unit file through its package's test script, then `pnpm typecheck`.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/types/src/text.test.ts::isBlank` | `isBlank` does not exist | `isBlank` trims and compares with the empty string |

## Hypotheses to attack

1. Hypothesis: no blank check changed meaning. Break it by: diffing each call site against the spec's list of the two that must stay raw.

## Known gaps

See the spec.
