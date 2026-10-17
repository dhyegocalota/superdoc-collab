# 0024. Times follow the reader's zone; storage stays epoch milliseconds

- Status: Accepted
- Date: 2026-10-17
- Deciders: Claude (lead, under the owner's "faça tudo sozinho" of 2026-10-17); Dhyego Calota (owner, requirement)
- Inspired by: [`docs/features/timezone-preference/audit.md`](../features/timezone-preference/audit.md), [0016](0016-timeline-bin-budget.md) (bin ladder and padding), [0020](0020-invite-only-accounts-with-a-first-claim-admin.md) (zone stored at sign-up)

## Context

Everything is stored and compared as UTC epoch milliseconds, which is right. Display and grouping are not: the timeline floors epoch milliseconds, so bins of an hour or more split at UTC boundaries, and labels use whatever zone and locale the browser has. The owner requires every user to see times coherent with a zone they choose, defaulting to the browser's.

## Decision

- Storage, comparisons, cooldowns, caps and version marks stay zone-free.
- Each user has a stored IANA zone; the web's effective zone is that value, or the browser's when it is still empty, and the UI always says which.
- The server builds timeline bins in the zone the client names on every timeline, edits and selection request (`timeZone`, required). A bin starts on a multiple of its size in local wall time (Monday 00:00 for weeks) and ends where the next starts, so bins carry an explicit `end` and a day across DST is 23 or 25 hours.
- One web formatter module takes the zone as a required parameter and pins the locale to `en-US`.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Keep UTC bins, only relabel | no API change | a "day" still splits at 21:00 in São Paulo | the defect the owner asked to fix |
| Fixed-length bins shifted by the current offset | no `end` field | wrong across DST: every bin after the change is off by an hour | correctness across DST is the point |
| Bin on the client | server unchanged | the client would need every event; versions and edits per bin are server-side | the server owns the bins |
| Default to UTC when no zone is sent | lenient API | a silent wrong answer for any client that forgets | the repository forbids masking missing values |
| Zone in local storage only | no schema | lost per browser; the server could not know it | the zone already lives on the user |

## Consequences

- `TimelineBin.end` is new and every consumer uses it; `start + binMs` is wrong from now on.
- Cache keys for timelines and selection summaries include the zone.
- E2E helpers that read the timeline pass a zone.

## Evidence

- `docs/features/timezone-preference/test-plan.md` after the build; the zone unit suites in `libs/history/src/timeline/zoned-time.test.ts` and `bins.test.ts`.

## Revisit when

- `Temporal` is available in every supported runtime, which would replace the `formatToParts` offset arithmetic.
- Organisations arrive and want a shared zone.
