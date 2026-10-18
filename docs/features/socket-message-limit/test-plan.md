# Test plan: The socket frame cap allows fast typing and reconnect bursts

## The failing test first

- [ ] `apps/server/src/collaboration/attach-collaboration.test.ts::a typing burst of 600 frames in one second is accepted and the socket stays open` — input: 600 frames in one second; expected: all 600 reach the room handler and the socket stays open
- [ ] Confirmed it fails for the right reason: `expected 121 to be 600`

## Unit

- [ ] `attach-collaboration.test.ts::the frame that breaches the limit reaches the room handler and nothing after it does` — expected: cap plus one frames reach the handler, the socket closes with 1008
- [ ] `attach-collaboration.test.ts::more frames than the cap before authentication close the socket with 1008, are not applied and are logged without the payload`
- [ ] `attach-collaboration.test.ts::more awareness frames than the cap close the socket with 1008 and the reason`
- [ ] `apps/server/src/limits/sliding-window.test.ts::a window at the cap keeps its newest entries and counts the same after each prune` (a pin: green when it landed)
- [ ] `socket-message-limit.test.ts`: the last message under the cap is accepted and the next breaches; messages older than a second stop counting; each socket has its own window

## Prove it for real

- [ ] Type 26 characters 50 ms apart into a new document on a stack of this branch; expected: no "Collaboration socket closed for sending too many messages" line, all 26 characters in the editor and the events API
- [ ] A flood of more than 1000 frames in one second on one socket; expected: closed with 1008

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: the reconnect burst (51 awareness frames in 4 ms) stays under the cap — attack: reconnect twice within a second; result:
- [ ] Claim 2: the cap is still a hard cap — attack: 1001 frames in a second on a raw socket; result:
- [ ] Claim 3: only the constant changed — attack: diff `attach-collaboration.ts` and `socket-message-limit.ts`; result:

## Coverage honesty

- The measurement is one scripted run; a real typist, paste and a second author were not measured.
