# A listener on `superdoc.socket` never fires, and a mocked socket in a unit test passes anyway
- Date: 2026-10-18
- Inspired by: the superseded-signal lane ([ADR 0036](../adr/0036-the-superseded-creator-page-learns-of-the-takeover-from-the-members-poll.md)); the first design read the 4403 close from `superdoc.socket`
- Revisited: 2026-10-18 — still true at SuperDoc 2.23.0 and `@superdoc/docx-engine` 0.22.0

## Signal
The typings say `SuperDoc.socket` is "set automatically when providerType is hocuspocus", so a `close` listener on it looks like the way to read the server's close code. The listener never fires. A unit test that mocks `SuperDoc` with a `socket` passes, so nothing in the suite warns.

## Cause
On the v2 collaboration path `socket` is only ever assigned `null` (`superdoc.es.js:46416`). The Hocuspocus provider and its websocket run inside the docx-engine collaboration worker, and the page receives only `{ state, kind, detail }` snapshots whose `detail` is limited to `transport-disconnected`. No close code or reason reaches the main thread. The property is a v1 leftover.

## Do
Read the dist for the assignment before designing around a documented property, and do not trust a mock that models a property the real class never sets. The page-side signal for admission state is the members poll, which carries the creator ticket and is answered `isAttemptSuperseded` (ADR 0036).

## Anchor
- `node_modules/superdoc/dist/superdoc.es.js:46416` (`this.socket = null`), the collaboration worker bundle in `@superdoc/docx-engine/dist/assets/`
- `docs/adr/0036-the-superseded-creator-page-learns-of-the-takeover-from-the-members-poll.md`
- `apps/web/src/features/editor/use-members.ts`
