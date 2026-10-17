# @superdoc-collab/web

The single-page app: React, Vite, TanStack Query and React Router, styled with Tailwind and shadcn/ui ([ADR 0009](../../docs/adr/0009-design-system.md)). SuperDoc renders the live editor and, inside an iframe, the read-only version viewer.

Run every script from the repository root with `pnpm --filter @superdoc-collab/web <script>`:

- `dev` serves the pages around the editor on port 5173 and proxies the API and the collaboration socket to the server on port 3000.
- `build` writes the bundle the server serves when `WEB_DIST_DIR` points at it.
- `preview` serves that build.
- `typecheck` and `test:unit` run the TypeScript compiler and Vitest with Testing Library.

The editor needs the built bundle: SuperDoc's worker breaks under the Vite dev server. To use documents, build and open the server's own port.
