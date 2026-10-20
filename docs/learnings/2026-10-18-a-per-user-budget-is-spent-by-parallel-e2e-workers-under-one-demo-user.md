# A per-user budget is spent by parallel E2E workers under one demo user

- Date: 2026-10-18
- Inspired by: the ninth `pnpm verify` run of room-admission, red on six E2E tests whose creator page showed "The document could not be loaded" right after its own upload, while 85 others passed.
- Revisited: 2026-10-19 — still true; the upload limit of `POST /api/documents` got the same knob (`UPLOADS_PER_MINUTE`) after a full E2E run spent one demo user's uploads

## Signal
Several unrelated specs fail at `uploadSeed` with the document load error on the uploader's own page, at the busiest minute of the run, and the trace shows the open route answering 429 while the members polls answer 200.

## Cause
The open budget allows 30 distinct uncommitted documents per user per minute. Five Playwright workers upload fresh documents as the same demo user, so together they spend one user's budget in under a minute; the limit is correct for a person and wrong for a suite.

## Do
Give every per-user limit an environment knob, leave production unset, and have the E2E stack (`e2e/stack.ts`) set a value the workers cannot spend; when a batch of specs fails at the same helper near the top of the run, read one trace's network entries for a 4xx before reading the failure as a regression.

## Anchor
`apps/server/src/environment.ts` (`OPEN_UNCOMMITTED_PER_MINUTE`), `e2e/stack.ts`, `apps/server/src/collaboration/room-modes.ts`
