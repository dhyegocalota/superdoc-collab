# Test plan: Snapshot compression

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/collaboration/socket-compression.test.ts` — input: an upgrade offering permessage-deflate; expected: the 101 response names the extension. — evidence: red at 77fc2c95 printed `expected 'http/1.1 101 switching protocols…' to contain 'sec-websocket-extensions: permessage-…'`; green at 033e21d6
- [x] same file — input: a joiner of a committed room holding about 1.8 MB of repeated text; expected: the joiner's text is identical and the client socket read under a quarter of the state size. — evidence: red at 77fc2c95 printed `expected 7361644 to be less than 1840050`; green at 033e21d6
- [x] same file — input: a client with the extension sends zeros one byte over `MAX_SOCKET_MESSAGE_BYTES`; expected: the extension is negotiated and the close code is 1009. — evidence: red at 77fc2c95 printed `expected '' to contain 'permessage-deflate'`; green at 033e21d6

- [x] `apps/server/src/collaboration/socket-compression.test.ts` — input: an upgrade offering the extension; expected: the response names a 12-bit window each way. — evidence: red at the commit before 3998f317 printed `expected 'http/1.1 101 switching protocols…' to contain 'server_max_window_bits=12'`; green at 3998f317
- [x] `socket-message-limit.test.ts` and `socket-compression.test.ts` — input: frames inflating to the budget, then one more; two frames of 60 MiB zeros on a real socket; expected: the next is over, the socket closes with 1008. — evidence: red at 8a7a1bfe printed `exceedsInflatedBudget is not implemented` and `expected null to be 1008`; green at b4ec67b5
- [x] same file, bootstrap path — input: the same two frames on `/collaboration/bootstrap`; expected: no 1008. — evidence: pin at 8a7a1bfe (green when it landed)

- [x] `socket-message-limit.test.ts` and `socket-compression.test.ts` — input: frames up to 64 KiB then one byte more before the server answers; a 64 KiB + 1 frame on a real socket that never authenticates; expected: the next is over, the socket closes with 1008, an answered socket is free, time does not reset the total. — evidence: red at 1a323e7c printed `exceedsPreAuthenticationBudget is not implemented` and `expected null to be 1008`; green at dd27c716

- [x] `auth-reply.test.ts`, `attach-collaboration.test.ts` and `socket-compression.test.ts` — input: an Authenticated, a permission-denied and unrelated frames read by `authReplyOf`; a stub socket whose first reply is not the answer then a 64 KiB + 1 frame; a denied stub socket; a real signed-in stranger denied a document — expected: the pre-authentication total stays until the Authenticated reply, a denied socket is closed with 1008 and no later frame reaches the room handler. — evidence: red at ee9b38e0 printed `authReplyOf is not implemented`, `expected null to be 1008` and two timeouts; green at fe142f00

## Unit

- [x] The existing payload cap, frame cap and rate cap tests of `attach-collaboration.test.ts` — expected: still green with compression on. — evidence: 57 passed across the two files at 033e21d6

## E2E (Playwright specs)

- [x] `e2e/room-admission.spec.ts` — run once; expected: green. — evidence: log /private/tmp/claude-501/-Users-dhyegocalota-Projects-superdoc-take-home/87806e9b-71f0-4aa9-9a22-f58a8d2c7388/scratchpad/e2e-final4.log at dd27c716: 4 passed (an earlier run at 3998f317 failed `two editors open an uploaded document` under machine load and passed alone and in this run). Earlier runs of the large-fixture test on this lane measured 4.94 MB on the wire per socket against 36.6 MB without compression

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [x] Claim 1: the payload cap counts inflated bytes — attack: a compressed frame under the cap that inflates past it; result: closed with 1009 — evidence: `a frame small on the wire and over the payload cap once decompressed closes with 1009` green at 3998f317
- [x] Claim 2: a client without the extension still syncs — attack: an upgrade with no extensions header; result: the existing suites connect through providers that omit nothing, so this stays covered by `ws` itself, not by a test here — evidence: none beyond ws; stated honestly
- [x] Claim 4: a socket that never authenticates cannot queue more than 64 KiB — attack: one 64 KiB + 1 frame before Auth; result: closed with 1008 — evidence: green at dd27c716
- [x] Claim 3: repeated frames cannot amplify past the budget — attack: two 60 MiB inflating frames within a second; result: closed with 1008 — evidence: green at b4ec67b5

## Coverage honesty

- Loopback has no bandwidth limit, so the E2E shows bytes saved and no time saved.
- Whether a given reverse proxy forwards the extension header is not tested here.
