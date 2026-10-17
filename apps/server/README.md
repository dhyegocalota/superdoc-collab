# @superdoc-collab/server

One Node process on one port: Hono serves the REST API and the built SPA, Hocuspocus serves the collaboration WebSocket, one worker thread runs the projection, and the language-model jobs run in-process under the caps of [ADR 0011](../../docs/adr/0011-process-wide-llm-cost-caps.md) ([ADR 0004](../../docs/adr/0004-stack.md)). Accounts are by invitation: the first sign-up claims the instance as administrator, and every later one needs a single-use invite ([ADR 0020](../../docs/adr/0020-invite-only-accounts-with-a-first-claim-admin.md)).

The example environment file at the repository root documents every variable.
