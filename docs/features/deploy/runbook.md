# Deploy runbook: Dokploy

How to put SuperDoc History on a VPS that runs Dokploy, check it, seed the demo accounts and roll back. About ten minutes once DNS resolves. The decision behind this shape is [ADR 0013](../../adr/0013-deploy-with-dokploy-compose.md).

Steps marked **(from memory, verify in the UI)** describe Dokploy screens that could not be checked from the machine that wrote this runbook. Labels may differ slightly in your Dokploy version; the intent of each step does not.

## What gets deployed

- [`deploy/docker-compose.yml`](../../../deploy/docker-compose.yml): one service, `app`, built from [`docker/Dockerfile`](../../../docker/Dockerfile) with the repository root as the build context.
- The container listens on port 3000 inside the Dokploy network (`expose`, no host port). Traefik terminates HTTPS and forwards both HTTP and the collaboration WebSocket to it.
- All data lives on the named volume `superdoc-data`, mounted at `/data`: `auth.sqlite`, `history.sqlite` and `read-model.sqlite` (each with its `-wal` and `-shm` files) and `documents/<id>.docx`.
- The compose file pins `PORT=3000`, `DATABASE_DIR=/data`, `WEB_DIST_DIR=/app/web` and `TRUST_PROXY=true`. Everything else comes from the Dokploy environment.
- One instance only ([ADR 0004](../../adr/0004-stack.md)). Never scale the service above one replica: SQLite and the language-model caps assume a single process.

## Before you start

1. Pick a domain or subdomain you control, for example `history.example.com`. Create a DNS `A` record pointing it at the VPS's public IP, and an `AAAA` record if the VPS has IPv6. Let's Encrypt needs it to resolve before step 3. If the DNS is on Cloudflare, set the record to **DNS only** (grey cloud): behind Cloudflare's proxy every visitor arrives from a Cloudflare address, the rate limits treat them all as one client, and the certificate challenge can fail (from memory, verify in the UI).
2. Make sure Dokploy can read the repository: its GitHub app has access to `dhyegocalota/superdoc-take-home`, or the repository is public and you use the Git provider with `https://github.com/dhyegocalota/superdoc-take-home.git`.
3. Generate the auth secret on any machine and keep the output for step 2:

   ```bash
   openssl rand -base64 48
   ```

   Never reuse the `AUTH_SECRET` from `.env.example`: it is public and long enough to pass validation.
4. Choose the demo accounts' password: at least 8 characters, letters, digits, `-` and `_` only. Compose's `.env` parser reads `$` as a variable, treats ` #` as the start of a comment and strips quotes, so any other character can silently change the password. It goes only into the Dokploy environment and the delivery message, never into the repository.
5. Have the OpenRouter API key ready. Without it the app still runs; topics and summaries then say the language model is unavailable.

## 1. Create the compose service (from memory, verify in the UI)

1. Dokploy → **Projects** → **Create Project**, name `superdoc-history`.
2. Open the project → **Create Service** → **Compose**. Name `superdoc-history`, compose type **Docker Compose** (not Stack) → **Create**.
3. In the service, **General** tab: provider **GitHub** (or **Git** with the public URL), repository `dhyegocalota/superdoc-take-home`, branch `main`, **Compose Path** `./deploy/docker-compose.yml` → **Save**.

## 2. Set the environment (from memory, verify in the UI)

**Environment** tab → paste the block below, replace the four values in angle brackets → **Save**.

```dotenv
APP_ORIGIN=https://<your domain>
AUTH_SECRET=<the output of openssl rand -base64 48>
SEED_DEMO_USERS=true
DEMO_PASSWORD=<the demo password you chose>
OPENROUTER_API_KEY=<your OpenRouter key>
LLM_MODEL=openai/gpt-6-luna
OPENROUTER_BASE_URL=
LLM_MAX_CONCURRENT_JOBS=
LLM_MAX_CALLS_PER_HOUR=
```

| Variable | Secret | What it does |
|---|---|---|
| `APP_ORIGIN` | no | The public origin. Exactly `https://` plus the domain: no path, no trailing slash, or the server refuses to start. |
| `AUTH_SECRET` | yes | Signs sessions. Changing it signs everyone out. |
| `SEED_DEMO_USERS` | no | `true` makes the container create Ana, Bruno, Caio and Dani on start. Idempotent: existing accounts keep their password. |
| `DEMO_PASSWORD` | yes | The demo accounts' password. Required while `SEED_DEMO_USERS=true`; the container refuses to start without it. |
| `OPENROUTER_API_KEY` | yes | The language-model key. Empty keeps the app running without topics and summaries. |
| `LLM_MODEL` | no | The model id sent to OpenRouter. |
| `OPENROUTER_BASE_URL` | no | Empty in production; only tests point it at a fake. |
| `LLM_MAX_CONCURRENT_JOBS` | no | Empty keeps the default of 2 model jobs at once ([ADR 0011](../../adr/0011-process-wide-llm-cost-caps.md)). |
| `LLM_MAX_CALLS_PER_HOUR` | no | Empty keeps the default of 60 model calls per rolling hour. |

Do not set `PORT`, `DATABASE_DIR`, `WEB_DIST_DIR` or `TRUST_PROXY`: the compose file pins them.

## 3. Attach the domain (from memory, verify in the UI)

**Domains** tab → **Add Domain**: host `<your domain>`, path `/`, service name `app`, container port `3000`, **HTTPS** on, certificate provider **Let's Encrypt** → **Create**. Dokploy adds the Traefik labels and its network to the service when it deploys; the compose file declares neither. The WebSocket on `/collaboration` needs no extra setting.

## 4. Deploy (from memory, verify in the UI)

**General** tab → **Deploy**. Follow the build under **Deployments** → the newest entry. The first build takes a few minutes: it installs dependencies and builds the web app and the server.

On the first start, the service's **Logs** show:

```text
created: ana@example.com, bruno@example.com, caio@example.com, dani@example.com
existing: 
listening on :3000
```

Later deploys list the four emails under `existing:` instead.

| What you see | Cause | Fix |
|---|---|---|
| `required variable AUTH_SECRET is missing a value` (or `APP_ORIGIN`, `SEED_DEMO_USERS`) in the deploy log | The Environment tab was not saved, or Dokploy wrote its `.env` outside the compose file's folder | Save the Environment tab and deploy again. If it persists, open the service's **Advanced** tab and set a custom compose command that adds `--env-file` with the path of the `.env` Dokploy writes, for example `--env-file ./.env` when it writes at the repository root (from memory, verify in the UI). Do not move the compose file: the repository root already holds the local `docker-compose.yml`. |
| `Missing environment variable: DEMO_PASSWORD (required when SEED_DEMO_USERS=true)` in the logs, container restarting | `DEMO_PASSWORD` is empty | Set it and deploy again, or set `SEED_DEMO_USERS=false`. |
| `SEED_DEMO_USERS must be true or false` in the logs | Any other value, for example `TRUE` or `1` | Set exactly `true` or `false`. |
| `Environment variable APP_ORIGIN must be a bare origin` | A path or a trailing slash | Set `https://<your domain>` and nothing else. |
| `Database directory is not writable: /data` | `/data` was replaced by a bind mount owned by root | Remove the mount from the **Advanced** → **Volumes** tab (from memory, verify in the UI); keep the named volume from the compose file. |
| The browser shows a Traefik `404 page not found` | The container is not healthy yet, or the domain is not attached to service `app`, port `3000`. Traefik skips a container while its health check is starting or failing, so the first ~20 s after every deploy answer 404 (from memory, verify in the UI). | Wait for **Logs** to show `listening on :3000` and about 20 s more. If the 404 stays, redo step 3. |
| The 404 stays although **Logs** show `listening on :3000` | The health check keeps failing. The container stays up but unhealthy: `restart: unless-stopped` restarts it only when it exits, never on a failing health check | On the VPS, `docker ps` shows the container as `unhealthy`; `docker inspect --format '{{json .State.Health}}' <container>` prints the last probes. Fix the cause and deploy again. |
| The container keeps restarting | It exits on start; Docker restarts it after every exit | Read the first error in **Logs**: it is one of the rows above. |
| A certificate warning | DNS did not resolve when Let's Encrypt asked | Fix the DNS record, then deploy again. |
| Sign-in answers `403` | `APP_ORIGIN` is not the URL in the browser's address bar | Set it to that exact origin and deploy again. |

## 5. Check it

```bash
curl -s https://<your domain>/api/health
```

prints `{"status":"ok"}`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: application/json' -H 'origin: https://<your domain>' -d '{"email":"ana@example.com","password":"<the demo password>"}' https://<your domain>/api/auth/sign-in/email
```

prints `200`.

Then, in a browser:

1. Open `https://<your domain>`: the sign-in page loads over HTTPS without a warning.
2. Sign in as `ana@example.com` with the demo password, **Upload .docx** with [the brief](../../brief/superdoc-eng-sample-project.docx), and type a sentence.
3. **Share** → copy the edit link → open it in a private window, sign in as `bruno@example.com` and type next to Ana: each sees the other's edits within a second.
4. **Toggle timeline**: the chart shows both authors; click a moment, the document opens as it was, **Back to live** returns.
5. **Summarize edits** answers with one to three sentences (needs the OpenRouter key).

## 6. Hand it over

1. In `README.md`, replace the line that starts with `- **Demo:**` with `- **Demo:** https://<your domain>` and merge it through a pull request.
2. Make the repository public. This cannot be taken back: the whole history becomes public. First check the history for secrets, from a fresh clone of `main`; both commands must print what is shown:

   ```bash
   git log --all -p | grep -cE 'sk-or-v1-[A-Za-z0-9]{16,}'
   ```

   prints `0`, and

   ```bash
   git log --all --oneline -- .env deploy/.env
   ```

   prints nothing. Then GitHub → **Settings** → **General** → **Danger Zone** → **Change visibility**.
3. Send the delivery message: the demo URL, the GitHub link, the four demo emails and the demo password.
4. Optional: turn on **Autodeploy** in the **General** tab (from memory, verify in the UI) so every push to `main` deploys.

## 7. Roll back

Data stays on the volume across deploys and rollbacks. Migrations so far only add tables and columns, so an older release runs on a database that a newer one migrated.

**Revert (preferred).** Revert the bad pull request's merge commit on a branch, merge it, and deploy:

```bash
git switch main && git pull
git switch -c fix/revert-bad-release
git revert -m 1 <merge commit of the bad pull request>
git push -u origin fix/revert-bad-release
```

**Pin a known-good commit (fastest).** Point a branch at the last good commit and deploy it:

```bash
git push origin <last good commit>:refs/heads/release/rollback
```

Dokploy → **General** → branch `release/rollback` → **Save** → **Deploy** (from memory, verify in the UI), then run step 5 again. When `main` is fixed, set the branch back to `main`, deploy, and delete the branch with `git push origin --delete release/rollback`.

If your Dokploy version lists a **Rollback** action on a past entry under **Deployments** (from memory, verify in the UI), it does the same as pinning.

## 8. Back up and reset

Dokploy prefixes the volume with the service's app name (from memory, verify in the UI). Find it on the VPS:

```bash
docker volume ls --filter name=superdoc-data
```

**Back up.** **Stop** the service in Dokploy so SQLite is not writing, then:

```bash
docker run --rm -v <volume name>:/data:ro -v "$PWD":/backup busybox tar czf /backup/superdoc-data.tgz -C /data .
```

**Deploy** again to start it.

**Restore.** Stop the service, then:

```bash
docker run --rm -v <volume name>:/data -v "$PWD":/backup busybox sh -c 'find /data -mindepth 1 -delete && tar xzpf /backup/superdoc-data.tgz -C /data'
```

and deploy. `tar` running as root keeps the files owned by uid 1000, the `node` user the container runs as.

**Reset.** Stop the service, run `docker volume rm <volume name>`, and deploy: the volume is recreated empty, owned by `node`, and the demo accounts are seeded again.
