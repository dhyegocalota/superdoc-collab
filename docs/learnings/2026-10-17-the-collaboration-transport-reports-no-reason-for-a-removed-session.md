# A removed session shows lost, reconnecting and failed within milliseconds, with no reason anywhere

- Date: 2026-10-17
- Inspired by: the tester's removed-cookie walk for `docs/features/connection-state/` (`tester-briefing.md`, session-ended row); design 1.14 expected the callback's `detail` or an `exception` to carry the reason
- Revisited: 2026-10-17 — still true at SuperDoc 2.23.0; `useMembers.isSessionEnded` and `resolveFailureReason` are the app's answer
- Revisited: 2026-10-18 — changed because the Superseded reason is derived the same way, from the members poll (`isAttemptSuperseded`), not from the transport (ADR 0036)

## Signal
With the session cookie removed under an open editor, `onCollaborationConnectionChange` fires `lost`, `reconnecting` and `failed` in a few milliseconds, each with `detail: null`, and `onException` never fires. The banner has no reason to show and reads Unknown.

## Cause
The worker transport reports the state change without the close code and raises no `exception` for a removed session, so the client cannot read why it failed. Why SuperDoc drops the code was not diagnosed; the observed payloads are what the app relies on.

## Do
Derive the reason from the app's own traffic: a 401 on the members poll means the session ended (`isSessionEnded` in `use-members.ts`), and `resolveFailureReason` turns Unknown into `SessionEnded`, with a Sign in action instead of Reload. Never wait for the callback or an exception to name the reason. Refetch members when a Failed report arrives so the 401 is seen.

## Anchor
`apps/web/src/features/editor/use-members.ts`, `use-connection-state.ts`, `connection-banner.tsx`, `e2e/connection-state.spec.ts` (removed session), commits `450fc82`, `f84654a`, `dd182c7`, `35d4019`, `a996f7f`
