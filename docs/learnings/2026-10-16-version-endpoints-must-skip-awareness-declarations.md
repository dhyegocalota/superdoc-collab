# Version endpoints must not declare identities or awareness

- Date: 2026-10-16
- Inspired by: slice 3 Task 9 review (version rooms registered no `onAwarenessUpdate`, `onChange` or `onStoreDocument`), ADR 0002 identities
- Revisited: 2026-10-16
- Revisited: 2026-10-17 — still true: `version-rooms.ts` is untouched by final-visuals; only the reader spec moved with the new chrome

## Signal
A reader opening a past version would appear as an author in the identity log, and the live document would show a ghost cursor from the viewer.

## Cause
The live room records declared identities from awareness and appends updates to the log; a version room reuses the same client code paths.

## Do
Version rooms register no awareness, change or store hooks, force `connection.readOnly` on every authenticate, and never touch the log, identities or room mode; test that a viewer's typing changes nothing server-side.

## Anchor
`apps/server/src/collaboration/version-rooms.ts`, `version-rooms.test.ts`, `e2e/time-travel.spec.ts` (reader spec)
