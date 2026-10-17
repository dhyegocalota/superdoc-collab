# @superdoc-history/web

The single-page app: React 19, Vite, TanStack Query and React Router, styled with Tailwind and shadcn/ui ([ADR 0009](../../docs/adr/0009-design-system.md)). SuperDoc renders the live editor and, inside an iframe, the read-only version viewer.

## Commands

Run from the repository root with `pnpm --filter @superdoc-history/web <script>`.

| Script | Does |
|---|---|
| `dev` | `vite` on port 5173, proxying `/api` and the `/collaboration` WebSocket to the server on port 3000 |
| `build` | `vite build` into `dist/`, which the server serves when `WEB_DIST_DIR=apps/web/dist` |
| `preview` | `vite preview` of the build |
| `typecheck` | `tsc --noEmit` |
| `test:unit` | Vitest with Testing Library ([`src/test-setup.ts`](src/test-setup.ts)) |

The editor needs the built bundle: SuperDoc's worker breaks under `vite dev`. Use `dev` for the pages around the editor, and `build` plus the server's own port for documents.

## Layout

| Folder | Holds |
|---|---|
| [`src/app/`](src/app/) | providers and the router |
| [`src/features/auth/`](src/features/auth/) | sign-in and sign-up, and the auth client with the OAuth provider plugin |
| [`src/features/oauth-consent/`](src/features/oauth-consent/) | the consent page an AI client's authorization request lands on: client name, scopes in plain words, Approve and Deny |
| [`src/features/connected-apps/`](src/features/connected-apps/) | the Connected apps page: consents with Revoke, and the MCP URL with copy-ready snippets for Claude Code, Cursor and ChatGPT |
| [`src/features/documents/`](src/features/documents/) | the document list, upload and new document |
| [`src/features/editor/`](src/features/editor/) | the document page: the SuperDoc editor, its header (rename, download, delete), members, the Share dialog and edit highlights |
| [`src/features/sharing/`](src/features/sharing/) | the landing page that accepts a share link |
| [`src/features/timeline/`](src/features/timeline/) | the timeline panel: streamgraph with its hatched agent layer and agent action marks, filter, top edits, topics, selection summaries and the time-travel state |
| [`src/features/versions/`](src/features/versions/) | the read-only version viewer, its frame and its banner |
| [`src/components/ui/`](src/components/ui/) | shadcn/ui components copied into the repository |
| [`src/lib/`](src/lib/) | the API client, the query client, formatters and small hooks |
| [`src/testing/`](src/testing/) | render helpers and fixtures for the unit tests |

`@/` resolves to `src/`. Shared types and route builders come from [`libs/types`](../../libs/types/).
