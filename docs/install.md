# Install and run

How to install SuperDoc Collab on your own machine or on Railway, by hand or with an agent, then claim it and invite your team. The repository README stays a one-screen overview; this page is the operator's guide.

## Quick start

Requirements: Docker with Compose v2.

```bash
cp .env.example .env
sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 48)|; s|^APP_ORIGIN=.*|APP_ORIGIN=http://localhost:3000|" .env
docker compose --env-file .env -f docker/docker-compose.local.yml up --build -d
```

The local compose file runs as project `superdoc-collab-local`, apart from the production file. A data volume created before the compose files moved under `docker/` is not carried over: `docker volume ls` shows it, and you copy its data or discard it.

Open <http://localhost:3000> and claim the instance: the first account you create becomes the administrator. `docker compose --env-file .env -f docker/docker-compose.local.yml down -v` erases all data and returns the instance to unclaimed. The healthcheck calls `/api/health`.

## Install on Railway

The [Railway runbook](features/deploy/runbook-railway.md) creates the service, the volume and the variables, checks the deploy, claims the instance and rolls back. The service is built from [`docker/Dockerfile`](../docker/Dockerfile) with a volume at `/data`, one replica and Railway's TLS domain ([ADR 0019](adr/0019-deploy-on-railway.md)). [`docker/docker-compose.yml`](../docker/docker-compose.yml) documents the same environment for any compose host. The `docker` gate of `pnpm verify` builds the image when its own files change, and the verify workflow also boots it on pull requests when hosted runs are available.

## Install with an agent

Paste this into Claude Code, Codex or any agent with a shell. It installs the app and stops where only you can continue.

```text
Install https://github.com/dhyegocalota/superdoc-collab by following docs/agent-install.md in that repository.
```

The agent's steps live in [`agent-install.md`](agent-install.md): one question (Railway or Docker Compose), the environment in [Configuration](#configuration), a health check, then the claim is yours.

## Run from source

With Node 24 and pnpm:

```bash
cp .env.example .env
pnpm install
pnpm build
scripts/with-env.sh pnpm seed
WEB_DIST_DIR=apps/web/dist scripts/with-env.sh pnpm --filter @superdoc-collab/server start
```

Topics and summaries need `OPENROUTER_API_KEY` in `.env`; without it the app works and the chart shows one band per author.

## Develop with an agent

Clone the repository and open it in Claude Code or Codex. The first session reports which tools the harness needs and are missing on this machine, with the install command for your platform; approve the installs you want, then ask for `/verify`. The list lives in `.agents/hooks/doctor.sh` and nowhere else.

## First login

Open the URL the install printed. An unclaimed instance shows "Claim this instance": create your account there. You are the administrator and sign-up closes behind you. Until you claim it anyone who finds the URL could, so do it right after the deploy. Your list then holds a sample document, "SuperDoc Collab: a guided tour", with five days of edits by four authors; **Create the showcase document** under `/admin` adds another.

Times follow your account's time zone: it is taken from your browser at sign-up (or at your next sign-in for older accounts), shown next to the timeline as "Times in <zone>", and changed under **Settings**. Timeline bins of an hour or longer start on your local clock, so a day runs from your local midnight.

## Invite your team

1. Open `/admin` and choose **Generate invite**.
2. Copy the link from the dialog and send it. The app sends no email.
3. The invitee opens the link, creates an account and lands in the documents list. Each link works once and expires after 7 days.

Pending invites can be revoked on the same page, and an administrator can promote or demote others; the last administrator cannot be demoted.

A person who forgot their password asks an administrator for a link: in the users table choose **Reset password**, copy the link from the dialog and send it. The link works once, expires after an hour, opens a page where the person chooses a new password and ends their other sessions.

Then try it: upload a `.docx` or start a blank document, type a few sentences, **Share** it and edit next to a teammate. **Toggle timeline** shows the edits per topic, a click on the chart opens the document as it was then (**Back to live** returns), `@name` filters by author, and **Summarize edits** writes one to three sentences about the edits on screen.

## Configuration

The server reads these from the environment; there is no dotenv loader. [`.env.example`](../.env.example) lists them with local values.

| Variable | Default | Purpose |
|---|---|---|
| `APP_ORIGIN` | none, required | The public origin: `https://<domain>`, no path, no trailing slash. A mismatch makes sign-in answer 403 |
| `AUTH_SECRET` | none, required | Signs sessions; generate with `openssl rand -base64 48`. Never reuse the placeholder in `.env.example` |
| `PORT` | `3000` | Port of the one Node process |
| `HOST` | empty | Optional address to bind; empty binds every interface, which the container needs behind its proxy |
| `DATABASE_DIR` | `./data` (`/data` in the image) | Where the SQLite files and `documents/<id>.docx` live; mount a volume here |
| `WEB_DIST_DIR` | `/app/web` in the image | The built SPA the server serves |
| `TRUST_PROXY` | none, required (`false` in `.env.example`) | `true` only behind a reverse proxy that sets `X-Forwarded-For` (Railway); the client address is the entry that proxy added, counted from the right ([ADR 0042](adr/0042-the-client-address-is-the-rightmost-trusted-hop.md)) |
| `TRUSTED_PROXY_HOPS` | `1` | Trusted proxies in front of the app, counted from the right of `X-Forwarded-For`; a positive integer, read only when `TRUST_PROXY=true` |
| `OPENROUTER_API_KEY` | empty | The model key; empty keeps the app running without topics and summaries |
| `LLM_MODEL` | `openai/gpt-6-luna` in `.env.example` | The OpenRouter model id |
| `OPENROUTER_BASE_URL` | empty | Another OpenRouter-compatible endpoint; tests point it at a fake |
| `LLM_MAX_CONCURRENT_JOBS` | `2` | Model jobs at once, for the whole server ([ADR 0011](adr/0011-process-wide-llm-cost-caps.md)) |
| `LLM_MAX_CALLS_PER_HOUR` | `60` | Model calls per rolling hour, for the whole server |
| `OPEN_UNCOMMITTED_PER_MINUTE` | `30` | Documents one user may open for the first time per rolling minute |
| `UPLOADS_PER_MINUTE` | `30` | Uploads and blank creates one user may make per rolling minute |
| `MEMORY_LIMIT_MEGABYTES` | none | The memory limit of the container in megabytes, set by the entrypoint from the cgroup limit; unset means unknown and no upload is refused for memory. Preparing a document needs about 500 bytes of memory per byte of its `word/document.xml` (the inflated text and layout, not the size of the file) plus 512 MB, so a 4 GB service prepares documents with up to about 7 MB of text and layout and answers a larger one with a 413 that names the largest size; 8 GB (the Railway Hobby maximum) prepares up to 15 MB, which covers the owner's heaviest 10 MB file and leaves headroom |
| `PROJECTION_WORKER_HEAP_MEGABYTES` | none | Old-generation heap cap in megabytes for the projection worker thread. The container entrypoint sets 20% of the memory limit it reads from the cgroup, starts the server at 40% of it and gives each of the two SDK hosts `BOOTSTRAP_HOST_HEAP_MEGABYTES` at 20% (the five caps sum to 100% of the limit); unset keeps Node's default |
| `BOOTSTRAP_HOST_HEAP_MEGABYTES` | none | Memory in megabytes the collector of each of the two SDK host processes that convert a DOCX is sized for (one per bootstrap lane, both can run at once; the host is a Bun binary, so this is `BUN_JSC_forceRAMSize`, not a hard cap). Set by the container entrypoint; unset leaves the host unsized |
| `SEED_DEMO_USERS` | none, required, `true` or `false` | Tests only: `true` seeds four demo users and a test administrator on start. Production sets `false` ([ADR 0020](adr/0020-invite-only-accounts-with-a-first-claim-admin.md)) |
| `DEMO_PASSWORD` | `superdoc-demo` in `.env.example` | Tests only: the seeded accounts' password, required when `SEED_DEMO_USERS=true` |

## Recovery

- **One administrator by claim.** Only the first account becomes admin; others are promoted from `/admin`. An instance claimed without an admin (the role write failed) is recovered with `railway ssh -- node dist/admin-promote.js <email>` or `docker compose exec app node dist/admin-promote.js <email>`.
