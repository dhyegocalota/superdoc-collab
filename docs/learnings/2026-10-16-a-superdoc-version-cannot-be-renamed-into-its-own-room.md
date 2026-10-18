# A SuperDoc version cannot be renamed into its own room; isolate it by endpoint

- Date: 2026-10-16
- Inspired by: slice 3 spike fact 2 (`docs/features/timeline-and-time-travel/spike.md`), Task 9 (`apps/server/src/collaboration/version-rooms.ts`)
- Revisited: 2026-10-16 — ADR 0003 addendum
- Revisited: 2026-10-17 — still true; version endpoints are still routed to `versionRooms` before the member path in `attach-collaboration.ts`
- Revisited: 2026-10-17 — still true: `version-viewer.tsx` passes `versionCollaborationPath`; the viewer page now sits under `features/versions/`

## Signal
Opening a version in a room named `sd2/v2.1/<id>@<sequence>` never connects: SuperDoc builds the room name from the document id itself and ignores the suffix.

## Cause
The collaboration room name is derived inside SuperDoc (`sd2/v2.1/<documentId>`); the client offers no hook to rename it.

## Do
Give each version its own WebSocket endpoint (`/collaboration/versions/<documentId>/<sequence>`) served by a separate read-only Hocuspocus instance, authenticate the member before the instance exists, and let SuperDoc keep its usual room name.

## Anchor
`apps/server/src/collaboration/{attach-collaboration,version-rooms}.ts`, `apps/web/src/routes/version-view-page.tsx`
