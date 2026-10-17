# Install and run

How to install SuperDoc Collab on your own machine or on Railway, by hand or with an agent, then claim it and invite your team. The repository README stays a one-screen overview; this page is the operator's guide.

## Quick start

Requirements: Docker with Compose v2.

```bash
cp .env.example .env
sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 48)|; s|^APP_ORIGIN=.*|APP_ORIGIN=http://localhost:3000|" .env
docker compose up --build -d
```

Open <http://localhost:3000> and claim the instance: the first account you create becomes the administrator. `docker compose down -v` erases all data and returns the instance to unclaimed. The healthcheck calls `/api/health`.

## Install on Railway

The [Railway runbook](features/deploy/runbook-railway.md) creates the service, the volume and the variables, checks the deploy, claims the instance and rolls back. The service is built from [`docker/Dockerfile`](../docker/Dockerfile) with a volume at `/data`, one replica and Railway's TLS domain ([ADR 0019](adr/0019-deploy-on-railway.md)). [`deploy/docker-compose.yml`](../deploy/docker-compose.yml) documents the same environment for any compose host. CI builds and boots the image on every pull request.

## Install with an agent

Paste this into Claude Code, Codex or any agent with a shell. It installs the app and stops where only you can continue.

```text
Install https://github.com/dhyegocalota/superdoc-take-home for me.

1. Clone the repository and read README.md and docs/features/deploy/runbook-railway.md.
2. Ask me one question: Railway (hosted, about US$5/month) or Docker Compose on this machine. Do not continue until I answer.
3. Generate AUTH_SECRET with `openssl rand -base64 48`. Set the environment the runbook lists: PORT=3000, DATABASE_DIR=/data, WEB_DIST_DIR=/app/web, TRUST_PROXY=true (Railway) or false (local), APP_ORIGIN=<the public URL>, SEED_DEMO_USERS=false, and, if I give you an OpenRouter key, OPENROUTER_API_KEY and LLM_MODEL. Never print a secret.
4. Railway: follow the runbook steps 1 to 5 with the Railway CLI (I will run `railway login` when you ask). Docker: `docker compose up --build -d` with the variables above.
5. Verify: GET /api/health answers 200 and GET /api/setup answers {"claimed":false}.
6. Print the URL and stop. Tell me to open it and claim the instance: the first account created becomes the administrator, and sign-up closes behind it. Then tell me that /admin generates single-use invite links for my team.
```

## First login

Open the URL the install printed. An unclaimed instance shows "Claim this instance": create your account there. You are the administrator and sign-up closes behind you. Until you claim it anyone who finds the URL could, so do it right after the deploy.

Times follow your account's time zone: it is taken from your browser at sign-up (or at your next sign-in for older accounts), shown next to the timeline as "Times in <zone>", and changed under **Settings**. Timeline bins of an hour or longer start on your local clock, so a day runs from your local midnight.

## Invite your team

1. Open `/admin` and choose **Generate invite**.
2. Copy the link from the dialog and send it. The app sends no email.
3. The invitee opens the link, creates an account and lands in the documents list. Each link works once and expires after 7 days.

Pending invites can be revoked on the same page, and an administrator can promote or demote others; the last administrator cannot be demoted.

Then try it: upload a `.docx` or start a blank document, type a few sentences, **Share** it and edit next to a teammate. **Toggle timeline** shows the edits per topic, a click on the chart opens the document as it was then (**Back to live** returns), `@name` filters by author, and **Summarize edits** writes one to three sentences about the edits on screen.

## Configuration

The server reads these from the environment; there is no dotenv loader. [`.env.example`](../.env.example) lists them with local values.

| Variable | Default | Purpose |
|---|---|---|
| `APP_ORIGIN` | none, required | The public origin: `https://<domain>`, no path, no trailing slash. A mismatch makes sign-in answer 403 |
| `AUTH_SECRET` | none, required | Signs sessions; generate with `openssl rand -base64 48`. Never reuse the placeholder in `.env.example` |
| `PORT` | `3000` | Port of the one Node process |
| `DATABASE_DIR` | `./data` (`/data` in the image) | Where the SQLite files and `documents/<id>.docx` live; mount a volume here |
| `WEB_DIST_DIR` | `/app/web` in the image | The built SPA the server serves |
| `TRUST_PROXY` | `false` | `true` only behind a proxy that overwrites `X-Forwarded-For` (Railway) |
| `OPENROUTER_API_KEY` | empty | The model key; empty keeps the app running without topics and summaries |
| `LLM_MODEL` | `openai/gpt-6-luna` in `.env.example` | The OpenRouter model id |
| `OPENROUTER_BASE_URL` | empty | Another OpenRouter-compatible endpoint; tests point it at a fake |
| `LLM_MAX_CONCURRENT_JOBS` | `2` | Model jobs at once, for the whole server ([ADR 0011](adr/0011-process-wide-llm-cost-caps.md)) |
| `LLM_MAX_CALLS_PER_HOUR` | `60` | Model calls per rolling hour, for the whole server |
| `SEED_DEMO_USERS` | `false` | Tests only: `true` seeds four demo users and a test administrator on start. Production sets `false` ([ADR 0020](adr/0020-invite-only-accounts-with-a-first-claim-admin.md)) |
| `DEMO_PASSWORD` | `superdoc-demo` in `.env.example` | Tests only: the seeded accounts' password, required when `SEED_DEMO_USERS=true` |

## Recovery

- **One administrator by claim.** Only the first account becomes admin; others are promoted from `/admin`. An instance claimed without an admin (the role write failed) is recovered with `railway ssh -- node dist/admin-promote.js <email>` or `docker compose exec app node dist/admin-promote.js <email>`.
