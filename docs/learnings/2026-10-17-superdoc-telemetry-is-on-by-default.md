# SuperDoc sends usage telemetry to its vendor unless the config turns it off

- Date: 2026-10-17
- Inspired by: the first Railway walk (`docs/features/deploy/runbook-railway.md` → Check it): the tester saw `POST https://ingest.superdoc.dev/v1/collect` answering 200 from the editor page; the brief allows no third party but the LLM provider
- Revisited: 2026-10-17 — `telemetry: SUPERDOC_TELEMETRY` on both `new SuperDoc(...)` calls; `document-page.test.tsx` and `version-view-page.test.tsx` pin it
- Revisited: 2026-10-17 — still true; `superdocOptions` still passes `SUPERDOC_TELEMETRY` and both page tests still pin it; the version viewer only gained the exception narrowing

## Signal
The network panel shows requests to `ingest.superdoc.dev` although the app code never names that host; the local test suite cannot see them because it mocks `superdoc`.

## Cause
`superdoc` 2.23.0 defaults `telemetry` to `{ enabled: true }` with the community licence key, and only `telemetry: { enabled: false }` (or `null`) disables the collector. Nothing in the editor's own API surface hints at it.

## Do
Pass `telemetry: SUPERDOC_TELEMETRY` (`{ enabled: false }`) to every `SuperDoc` constructor, pin it in the component tests, and walk the deployed page with the network panel open after any SuperDoc upgrade: the default can come back.

## Anchor
`apps/web/src/features/editor/superdoc-telemetry.ts`, `superdoc-editor.tsx`, `apps/web/src/features/versions/version-viewer.tsx`, their tests
