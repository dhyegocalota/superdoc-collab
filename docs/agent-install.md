# Install SuperDoc Collab — instructions for an agent

You were asked to install SuperDoc Collab for the person you are working with. Follow these steps in order, and stop where only they can continue. The person's guide is [`install.md`](install.md); this file is yours.

1. Clone `https://github.com/dhyegocalota/superdoc-collab` unless you are already in it, then read `README.md` and [`docs/features/deploy/runbook-railway.md`](features/deploy/runbook-railway.md).
2. Ask one question: Railway (hosted, about US$5/month) or Docker Compose on this machine. Do not continue until they answer.
3. Generate `AUTH_SECRET` with `openssl rand -base64 48`. Set the environment the runbook lists: `PORT=3000`, `DATABASE_DIR=/data`, `WEB_DIST_DIR=/app/web`, `TRUST_PROXY=true` on Railway or `false` locally, `APP_ORIGIN=<the public URL>`, `SEED_DEMO_USERS=false`, and, if they give you an OpenRouter key, `OPENROUTER_API_KEY` and `LLM_MODEL`. Never print a secret.
4. Railway: follow the runbook steps 1 to 5 with the Railway CLI, and ask them to run `railway login` when you reach it. Docker: `docker compose --env-file .env -f docker/docker-compose.local.yml up --build -d` with the variables above.
5. Verify: `GET /api/health` answers 200 and `GET /api/setup` answers `{"claimed":false}`.
6. Print the URL and stop. Tell them to open it and claim the instance: the first account created becomes the administrator, and sign-up closes behind it. Then tell them that `/admin` generates single-use invite links for their team.
