# @superdoc-history/server

One Node process on one port: Hono serves the REST API and the built SPA, Hocuspocus serves the collaboration WebSocket, one worker thread runs the projection, and the language-model jobs run in-process under the caps of [ADR 0011](../../docs/adr/0011-process-wide-llm-cost-caps.md) ([ADR 0004](../../docs/adr/0004-stack.md)).

Run every script from the repository root with `pnpm --filter @superdoc-history/server <script>`:

- `dev` watches the sources; the configuration comes from the shell (`scripts/with-env.sh` loads `.env` without printing it).
- `build` bundles the server, the seed and the projection worker.
- `start` runs the bundle.
- `seed` creates the demo users; it is idempotent and existing accounts keep their password.
- `typecheck` and `test:unit` run the TypeScript compiler and Vitest against real HTTP, real SQLite and a real WebSocket.

## Configuration

`PORT`, `APP_ORIGIN`, `AUTH_SECRET` (at least 32 characters), `DATABASE_DIR` and `TRUST_PROXY` (`true` or `false`) are required. `WEB_DIST_DIR` serves a built SPA from the same port. `LLM_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `LLM_MAX_CONCURRENT_JOBS` and `LLM_MAX_CALLS_PER_HOUR` configure the model; without a key or a model, topics turn `failed`, selection summaries answer 503 and per-topic sentences are skipped. `seed` also reads `DEMO_PASSWORD`. [`.env.example`](../../.env.example) documents these variables and the ones only the container's entrypoint reads.
