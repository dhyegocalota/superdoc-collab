# Every upload is refused as not a docx in the built server while the unit tests pass
- Date: 2026-10-19
- Inspired by: the E2E gate of [server-bootstrap](../features/server-bootstrap/spec.md), where every UI upload showed "Only .docx files can be uploaded." and 100 cases failed in under six seconds each
- Revisited: 2026-10-19 — still true

## Signal

The server unit tests accept a generated docx, and the same bytes uploaded to the built server (`apps/server/dist/main.js`) are answered 415. The inflated size check of `inspectDocx` was the only new step, and its error branch reports a not-a-docx verdict.

## Cause

`ZipObject.nodeStream` needs `readable-stream`, which JSZip loads with a `require` inside a `try`. The server is bundled to ESM by `tsup`, where that `require` throws, JSZip swallows it, and `nodeStream` then throws that the platform does not support it. Vitest runs the sources unbundled, so the same call works there.

## Do

Stream an entry with `internalStream('uint8array')`, which every JSZip build has. It is documented but missing from the typings, so `libs/history/src/docx-signature.ts` types the few members it uses. Pausing it stops the inflate, so a zip bomb costs a bounded amount of memory. Prove a change to anything the bundle loads at runtime in the built server (one targeted Playwright case is enough), not only in Vitest.

## Anchor

`libs/history/src/docx-signature.ts`, `libs/history/src/docx-signature.test.ts`, `apps/server/tsup.config.ts`, `e2e/room-admission.spec.ts`
