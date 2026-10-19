# Test plan: Snapshot compression

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/collaboration/socket-compression.test.ts` — input: an upgrade offering permessage-deflate; expected: the 101 response names the extension. — evidence: red at 77fc2c95 printed `expected 'http/1.1 101 switching protocols…' to contain 'sec-websocket-extensions: permessage-…'`; green at 033e21d6
- [x] same file — input: a joiner of a committed room holding about 1.8 MB of repeated text; expected: the joiner's text is identical and the client socket read under a quarter of the state size. — evidence: red at 77fc2c95 printed `expected 7361644 to be less than 1840050`; green at 033e21d6
- [x] same file — input: a client with the extension sends zeros one byte over `MAX_SOCKET_MESSAGE_BYTES`; expected: the extension is negotiated and the close code is 1009. — evidence: red at 77fc2c95 printed `expected '' to contain 'permessage-deflate'`; green at 033e21d6

## Unit

- [x] The existing payload cap, frame cap and rate cap tests of `attach-collaboration.test.ts` — expected: still green with compression on. — evidence: 57 passed across the two files at 033e21d6

## E2E (Playwright specs)

- [x] `e2e/room-admission.spec.ts` — run once; expected: green. — evidence: tester run 2026-10-19, 4 of 4 passed inside the 3.4 min combined run; developer evidence: the `10 MB DOCX commits and reopens as Join` test passed twice with compression on and once off, with a server-side wire count of 4.94 MB per socket against 36.6 MB without compression

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: the payload cap counts inflated bytes — attack: a compressed frame under the cap that inflates past it; result: pending
- [ ] Claim 2: a client without the extension still syncs — attack: an upgrade with no extensions header; result: pending

## Coverage honesty

- Loopback has no bandwidth limit, so the E2E shows bytes saved and no time saved.
- Whether a given reverse proxy forwards the extension header is not tested here.
