# @superdoc-history/types

Types, enums and constants shared by the web app, the server and the E2E suite. Its one dependency is zod. It has no build step: Vite and the server's tsup bundle compile it from source.

| File | Holds |
|---|---|
| [`src/routes.ts`](src/routes.ts) | app and API route enums and their path builders |
| [`src/http.ts`](src/http.ts) | HTTP statuses, methods and the `Retry-After` header |
| [`src/auth.ts`](src/auth.ts), [`src/demo-users.ts`](src/demo-users.ts) | sign-in and sign-up schemas, limits and messages, the session user, the four demo accounts |
| [`src/documents.ts`](src/documents.ts) | roles, share-link roles, room modes, upload limits and the documents' user-facing messages |
| [`src/history.ts`](src/history.ts) | edit events, their kinds, authors with their actor and agent action marks |
| [`src/timeline.ts`](src/timeline.ts) | timeline, topics and selection summaries: page sizes, prompt caps, cooldowns and user-facing messages |
| [`src/constants.ts`](src/constants.ts) | time units, version-room and cache limits, the minimum `Retry-After` |

Generic constants (time units, limits) live in `src/constants.ts`; search it before declaring one locally. A new file is re-exported from [`src/index.ts`](src/index.ts).

`typecheck` (`tsc --noEmit`) and `test:unit` (Vitest) run through `pnpm --filter @superdoc-history/types <script>`.
