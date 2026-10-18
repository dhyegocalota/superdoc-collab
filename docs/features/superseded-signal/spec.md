# The superseded creator's page learns of the takeover at once

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-18 ("ok fix isso", after the explanation of the 40 to 60 s delay)
**ADRs:** [0036](../../adr/0036-the-superseded-creator-page-reads-the-close-code-from-the-socket.md)
**Not changing:** the server's takeover close (ADR 0033); the provider's reconnect policy for every other close code; the Failed banner's layout and its Reload action; the 409 waiting page.

## Problem

When the holder of an uncommitted room opens the document again, the server closes the first tab's socket with 4403 and the reason `This attempt was superseded` at once, but the first tab shows the Failed banner only 40 to 60 s later (or the editor notice after about 74 s when it was still loading), because the Hocuspocus provider treats 4403 as retryable and SuperDoc reports `failed` only after the retry loop has run. Until then the tab looks alive while every keystroke is dropped by the fence.

## Change

- `libs/types`: `ConnectionFailureReason.Superseded`.
- `apps/web/src/features/editor/superseded-close.ts`: `supersededReportOf(event)` returns a Failed `TransportReport` with reason `Superseded` only when the close code is `SUPERSEDED_ATTEMPT_CLOSE_CODE` and the reason is `SUPERSEDED_ATTEMPT_REASON`; every other event returns `null`.
- `SuperDocEditor`: as soon as the SuperDoc instance carries its `socket`, a `close` listener maps the event with `supersededReportOf`; a superseded close disconnects the socket (so the provider stops retrying) and reports the transport through the existing readiness rule: the banner on a ready page, the editor notice before ready. The listener is removed on destroy.
- `connection-copy.ts`: the reason copy, "This document was opened again in a newer tab. Reload to follow it."
- Docs: the room-admission spec drops the known limit; the connection-state spec lists the new reason; `docs/features/README.md` marks final-visuals, connection-state and room-admission as shipped.

## Tests

- Unit `superseded-close.test.ts` (red first): 4403 with the reason → Failed with `Superseded`; 4403 with another reason → `null`; 1006 → `null`.
- Unit `superdoc-editor.test.tsx`: a superseded close on the mocked socket calls `onTransportReport` with the Failed report and `socket.disconnect`; a 1006 close calls neither; the listener is detached on unmount; the socket property exists on the mocked SuperDoc surface the way SuperDoc 2.23.0 sets it.
- Unit `connection-copy.test.ts` or `connection-banner.test.tsx`: the Superseded reason renders its copy with Reload.
- E2E `room-admission.spec.ts::a holder who reopens a fresh document supersedes its first page and the room holds one paragraph`: the first page shows the Failed banner with the Superseded copy, or the editor notice, within `SUPERSEDED_SIGNAL_TIMEOUT_MS` (10 s) of the second open, instead of the 120 s large-commit timeout.
