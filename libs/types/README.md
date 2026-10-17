# @superdoc-history/types

Types, enums and constants shared by the web app, the server and the E2E suite: routes and their path builders, HTTP statuses, auth and document schemas, edit events, timeline and summary limits, user-facing messages and the generic time and size constants. Its one dependency is zod. It has no build step: Vite and the server bundle compile it from source.

Search the generic constants here before declaring one locally.

`typecheck` and `test:unit` run through `pnpm --filter @superdoc-history/types <script>`.
