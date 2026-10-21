# SuperDoc never becomes ready under `vite dev` and the worker fails to load
- Date: 2026-10-15
- Inspired by: the proof of concept's results and its Playwright config
- Revisited: 2026-10-16 — still true
- Revisited: 2026-10-21 — anchors moved off the proof of concept, removed on 2026-10-17, to the code that carries the fix today

## Signal
The page loads, the status never leaves its initial text and `window.poc.ready` stays `false` until the ready timeout. The browser console shows a failed worker load. The same page works after a production build.

## Cause
SuperDoc ships a web worker that the dev server's on-demand module transform and dependency pre-bundling cannot serve correctly. The built and previewed output resolves the worker as a static asset.

## Do
Use `vite build` followed by `vite preview` for anything that boots SuperDoc, including every automated test. Do not point Playwright at `vite dev`.

## Anchor
- `e2e/stack.ts` — `BUILD_AND_START_COMMAND` builds the web app and serves the build, never the dev server
