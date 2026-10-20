# A Node heap flag does nothing to the SDK host because it is a Bun binary
- Date: 2026-10-19
- Inspired by: [server-bootstrap](../features/server-bootstrap/spec.md), the capped repro of the 10 MB document
- Revisited: 2026-10-19 — still true

## Signal

The SDK host converting the 10 MB document reached 4.4 to 4.6 GB resident with `NODE_OPTIONS=--max-old-space-size=819` in its environment.

## Cause

`superdoc` and `superdoc-document-host` are Bun-compiled executables, not Node scripts. They run JavaScriptCore, which has no old-space flag, so `NODE_OPTIONS` is ignored. The cap the lane thought it set did not exist.

## Do

Size the host's collector with `BUN_JSC_forceRAMSize` in bytes. It is not a hard cap: the same run peaked at 2.2 GB resident with it set to 819 MB, half of the uncapped peak. Plan the container for the measured peak of the host, never for its setting, and measure again after an SDK upgrade.

## Anchor

`apps/server/src/history/bootstrap-host-environment.ts`, `apps/server/src/history/bootstrap-host-environment.test.ts`
