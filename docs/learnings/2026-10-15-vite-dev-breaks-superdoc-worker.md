# SuperDoc never becomes ready under `vite dev` and the worker fails to load
- Date: 2026-10-15
- Inspired by: poc/RESULTS.md; poc/playwright.config.ts
- Revisited: 2026-10-16 — still true

## Signal
The page loads, the status never leaves its initial text and `window.poc.ready` stays `false` until the ready timeout. The browser console shows a failed worker load. The same page works after a production build.

## Cause
SuperDoc ships a web worker that the dev server's on-demand module transform and dependency pre-bundling cannot serve correctly. The built and previewed output resolves the worker as a static asset.

## Do
Use `vite build` followed by `vite preview` for anything that boots SuperDoc, including every automated test. Do not point Playwright at `vite dev`.

## Anchor
- `poc/playwright.config.ts` — `webServer.command` is `pnpm exec vite build && pnpm exec vite preview`
- `poc/vite.config.ts` — `preview` block on port 5199
- `poc/tests/harness.ts` — `READY_TIMEOUT_MS` wait on `window.poc.ready`
