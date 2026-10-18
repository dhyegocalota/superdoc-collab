# Tester briefing: The socket frame cap allows fast typing and reconnect bursts

## What changed

- `libs/types/src/constants.ts`: `MAX_SOCKET_MESSAGES_PER_SECOND` 120 to 1000, with an ADR pointer.
- `apps/server/src/collaboration/attach-collaboration.test.ts`: a burst test and a shared helper; literal 121 names removed.
- `apps/server/src/collaboration/socket-message-limit.test.ts`: a test name that no longer states 120.
- ADR 0040, a status note on ADR 0034, the feature folder, a learning and the collaboration rule.

## How to run

Start a stack of the branch, sign in as a demo user, create a document and type quickly. Watch the server output for "Collaboration socket closed for sending too many messages".

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `attach-collaboration.test.ts::a typing burst of 600 frames in one second is accepted and the socket stays open` | the cap of 120 closed the socket: `expected 121 to be 600` | the cap is 1000 |

## Hypotheses to attack

1. Hypothesis: no typing speed a person reaches closes the socket. Break it by: paste a long text, type with two authors, hold a key down.
2. Hypothesis: a flood is still closed. Break it by: send 1001 frames in a second on a raw socket.
3. Hypothesis: the reconnect burst never trips the cap. Break it by: drop the connection twice within a second.

## Known gaps

- One scripted measurement of six update frames per keystroke; paste and multi-author load were not measured.
