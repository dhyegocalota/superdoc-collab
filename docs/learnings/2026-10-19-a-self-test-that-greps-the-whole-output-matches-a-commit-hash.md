# A self-test that greps the whole output matches a commit hash

- Date: 2026-10-19
- Inspired by: the full gate on `fix/owner-fixes-2026-10-19` at 60c4357e failing in `scripts/verify.test.sh` with `output matched /e2e/: base: f9b51d1d5e45cc8fe60b6f5ceb0642e2ed6132f2`
- Revisited: 2026-10-19 — fixed in the same branch

## Signal

`pnpm verify` ends with `verify: 1 check(s) failed` under the unit gate while every package suite is green; `scripts/verify.test.sh` prints `FAIL <name>: output matched /e2e/: base: <hash> (merge base)` and the hash contains the letters `e2e`.

## Cause

`expect_no_match` ran its pattern against the whole `--plan` output, which starts with `base: <merge-base hash>`. A hash is hexadecimal, so about one commit in a few hundred carries `e2e` somewhere, and the check that "a repository-shape or workflow diff plans no E2E gate" matched the hash instead of the gates line.

## Do

Match a negative assertion against the line it is about (`grep '^gates:'`), never against the whole output; the two `e2e` checks now do. Any new `expect_no_match` on `--plan` output follows the same rule.

## Anchor

`scripts/verify.test.sh` ("a workflow", "a repository shape test"), `scripts/verify.sh --plan` output format, gate log `.pr-media/gate/verify-60c4357e.log`
