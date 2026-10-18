# A page-level test waits one second by default and times out under machine load

- Date: 2026-10-18
- Inspired by: two gates on 2026-10-18 (the socket lane's, where `time-travel.test.tsx` failed three times with "Unable to find an element with the title: Document version", and two other tests earlier in the session lane), with the machine load near 14
- Revisited: 2026-10-18 — still true at testing-library's default `asyncUtilTimeout` of 1000 ms

## Signal
A test that renders the whole `DocumentPage` fails its first `findBy*` or `waitFor` with "Unable to find an element" although the same test is green alone. It happens only while other suites, builds or browsers share the machine.

## Cause
`findBy*` and `waitFor` give up after 1000 ms by default. Booting the page (queries, the stubbed editor, the timeline) takes well under that on an idle machine and over it under load, so the wait ends before the condition can hold.

## Do
`apps/web/src/testing/setup.ts` sets `asyncUtilTimeout` to five seconds once for every web test. No assertion is weakened: a passing test resolves as soon as its condition holds, and only a failing one waits longer. Do not raise a timeout inside a single test to fix this; a test that needs more than five seconds on an idle machine is waiting on something it should not.

## Anchor
- `apps/web/src/testing/setup.ts` (`ASYNC_UTIL_TIMEOUT_MS`)
- `apps/web/src/features/versions/time-travel.test.tsx`, `apps/web/src/features/editor/document-page.test.tsx`, `apps/web/src/features/timeline/timeline-panel.test.tsx`
