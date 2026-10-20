# 0044. Version builds are budgeted per user and capped in the projection queue

- Status: Accepted
- Date: 2026-10-19
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the security review of [ADR 0043](0043-a-known-version-sequence-resolves-exactly-and-marks-anchor-the-timeline.md), [ADR 0011](0011-process-wide-caps-on-language-model-spend.md) (refuse instead of queue), `apps/server/src/history/projection-queues.ts`

## Context

ADR 0043 resolves every known sequence exactly, so each sequence is its own cache entry and its first read is a miss. A miss reads and merges the log up to the sequence on the projection worker, whose queue is serial and shared by every document. A reader looping over all sequences of one document could keep that queue busy and stall projections, timelines and versions for the whole instance.

## Decision

- A user may start `VERSION_LOADS_PER_MINUTE = 30` version builds in a rolling minute. A build that is cached, already in flight or recently failed costs nothing; only the start of a new build is counted. Over the budget the text and summary routes answer 429 with `Retry-After`, and a version room refuses to load.
- The scheduler admits at most `MAX_PENDING_VERSION_JOBS = 8` version jobs at once. A request for the same version joins the one in flight; any other request above the cap is refused with `ProjectionBusyError`, which the routes answer as 503 with `Retry-After`. A refusal starts no failure cooldown on the version, so another member can build it at once. Nothing is queued behind the cap.

Thirty a minute is one new version every two seconds sustained, above a person who clicks bins or edit rows and below a loop. Eight pending jobs bound the worst wait of the serial queue to eight builds, a few seconds on the largest log measured.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Per-user budget and a queue cap (chosen) | one reader cannot monopolise the worker; the cap protects against many readers | a quick scrubber can meet 429 | the numbers are constants to tune |
| Queue cap only | no per-user state | one reader fills the cap and locks everyone else out | unfair |
| Per-user budget only | simple | many readers together still stall the queue | does not bound the queue |
| Queue and wait | every request is served | an unbounded queue is the problem | refusing is honest |

## Consequences

- A busy refusal is never cached: one reader filling the cap cannot blank a version for other members.
- A version socket rechecks its member when it connects and closes with the access revoked code, so a removal during the build wait leaves no open socket.
- The budget lives in memory per process, like ADR 0011's caps.
- A build of a document whose log exceeds `LARGE_ROOM_STATE_BYTES` spends `LARGE_VERSION_LOAD_WEIGHT` loads of the minute, because without a replay cache ([lighter projection](../features/lighter-projection/spec.md)) each step materializes the document; small documents spend one.

## Evidence

- `apps/server/src/history/versions-routes.test.ts`: the thirty-first miss answers 429 with `Retry-After`, a cached hit is not counted, another user is unaffected.
- `apps/server/src/history/projection-scheduler.test.ts`: above the cap a version is refused, not queued.

## Revisit when

- The owner wants other numbers, or builds move off the shared worker queue.
