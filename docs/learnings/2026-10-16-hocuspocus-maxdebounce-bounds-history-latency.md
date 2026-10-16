# Under continuous typing, history lags up to Hocuspocus's maxDebounce, not the debounce

- Date: 2026-10-16
- Inspired by: slice 2 final review refutation of "events within ~3 s"; tester measurement (first events after ~4 s)
- Revisited: 2026-10-16 — `maxDebounce` set to 4 s; projection from `onChange` deferred to slice 3

## Signal
Two authors type continuously and `/events` shows nothing for many seconds, then a burst.

## Cause
`onStoreDocument` runs after `debounce` ms of quiet, but continuous edits keep resetting it until `maxDebounce` (10 s by default) forces a store; projection is scheduled from the store.

## Do
Pass `maxDebounce` explicitly (4 s here) and state the latency honestly in briefings; for a live timeline, schedule projection on a throttle from `onChange` instead (slice 3).

## Anchor
`apps/server/src/collaboration/collaboration-server.ts`, `collaboration-server.test.ts` (store forced after a bounded delay)
