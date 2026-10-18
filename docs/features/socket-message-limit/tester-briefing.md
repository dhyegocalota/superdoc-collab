# Tester briefing: The socket frame caps allow fast typing and reconnect bursts

## What changed

- `libs/types/src/constants.ts`: `MAX_SOCKET_MESSAGES_PER_SECOND` becomes `MAX_SOCKET_UPDATE_FRAMES_PER_SECOND` (1000) and `MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND` (5000), each with an ADR pointer.
- `apps/server/src/collaboration/frame-bucket.ts`: reads the frame kind from the two leading varints.
- `apps/server/src/collaboration/socket-message-limit.ts`: one sliding window per bucket per socket; `attach-collaboration.ts` passes the frame.
- `apps/server/src/testing/socket-frames.ts`: frame builders for the tests.
- `apps/server/src/collaboration/attach-collaboration.test.ts`: a burst test and a shared helper; literal 121 names removed.
- `apps/server/src/collaboration/socket-message-limit.test.ts`: a test name that no longer states 120.
- ADR 0040, a status note on ADR 0034, the feature folder, a learning and the collaboration rule.

## How to run

Start a stack of the branch, sign in as a demo user, create a document and type quickly. Watch the server output for "Collaboration socket closed for sending too many messages".

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `attach-collaboration.test.ts::a typing burst of 600 frames in one second is accepted and the socket stays open` | the cap of 120 closed the socket: `expected 121 to be 600` | the cap is 1000 |
| `attach-collaboration.test.ts::an awareness burst of 3000 frames in one second is accepted and the socket stays open` | one cap of 1000 counted awareness too: `expected 1001 to be 3000` (red commit ce5fb831) | awareness has its own cap of 5000 |
| `attach-collaboration.test.ts::the awareness frame past its own cap closes the socket with 1008 and nothing after it is read` | `expected "vi.fn()" to be called 5001 times, but got 1001 times` | the awareness cap is 5000 |
| `frame-bucket.test.ts` (4 tests) | `frameBucketOf is not implemented for object` | the frame kind is parsed |

## Hypotheses to attack

1. Hypothesis: no typing speed a person reaches closes the socket. Break it by: paste a long text, type with two authors, hold a key down.
2. Hypothesis: a flood is still closed. Break it by: send 1001 frames in a second on a raw socket.
3. Hypothesis: the reconnect burst and the awareness flush after a long typing run never trip the caps. Break it by: drop the connection twice within a second; type non-stop for a minute then pause.
4. Hypothesis (headline): two authors typing ten seconds then pausing never breach. Break it by: the two-author walk with 30 s of typing.

## Known gaps

- Two scripted measurements (one author, then two authors with a paste); a real typist's pauses were not measured.
- Bruno's Enter at the document start loses Ana's concurrent keystrokes with or without any cap; it is a separate defect of the edit-rejection path (see the spec).
