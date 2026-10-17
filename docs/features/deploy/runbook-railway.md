# Deploy runbook: Railway

Supersedes the Dokploy runbook (`runbook.md`) per [ADR 0019](../../adr/0019-deploy-on-railway.md). Everything here runs with the Railway CLI from the repository root; the dashboard shows the same objects.

## What gets deployed

One service built from `docker/Dockerfile`, one volume at `/data`, one replica, health check on `/api/health`, public domain `https://<service>.up.railway.app`. `railway.json` declares the builder, the health check and the replica count.

## Before you start

- `brew install railway` (or `npm i -g @railway/cli`), then `railway login` (opens the browser; the owner does this, never an agent).
- An OpenRouter key and a model id (`.env.example` shows the names).
- Decide the demo password: letters, digits, `-` and `_` only.

## 1. Create the project and the service

```bash
railway init --name superdoc-history
railway up --detach
```

`railway up` uploads the working tree and builds the Dockerfile. The first build fails the health check until the variables below exist; that is expected.

## 2. Volume

```bash
railway volume add --mount-path /data
```

## 3. Variables

```bash
railway variables \
  --set PORT=3000 \
  --set DATABASE_DIR=/data \
  --set WEB_DIST_DIR=/app/web \
  --set TRUST_PROXY=true \
  --set RAILWAY_RUN_UID=0 \
  --set RAILWAY_DOCKERFILE_PATH=docker/Dockerfile \
  --set SEED_DEMO_USERS=true \
  --set DEMO_PASSWORD=<the demo password> \
  --set AUTH_SECRET="$(openssl rand -base64 48)" \
  --set LLM_MODEL=<model id> \
  --set LLM_MAX_CONCURRENT_JOBS=4 \
  --set LLM_MAX_CALLS_PER_HOUR=240
scripts/with-env.sh sh -c 'railway variables --set "OPENROUTER_API_KEY=$OPENROUTER_API_KEY"'
```

The last line passes the key from `.env` without printing it. `RAILWAY_RUN_UID=0` runs the container as root because Railway mounts the volume owned by root while the image switches to `node`; without it the server exits with `Database directory is not writable: /data`. `RAILWAY_DOCKERFILE_PATH` pins the Dockerfile even when `railway.json` is missing from the upload (`railway up` sends tracked files only). The caps above are demo-day values; ADR 0011's defaults are 2 and 60.

## 4. Domain and origin

```bash
railway domain
railway variables --set APP_ORIGIN=https://<the domain printed above>
railway up --detach
```

`APP_ORIGIN` must match the public URL exactly, or sign-in is refused by the origin check.

## 5. Check it

- [ ] `railway status` shows the service with one replica and a volume at `/data`.
- [ ] `curl -s https://<domain>/api/health` answers `200`.
- [ ] Sign-in smoke check answers `200`:
  ```bash
  curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -H "origin: https://<domain>" -d '{"email":"ana@example.com","password":"<the demo password>"}' https://<domain>/api/auth/sign-in/email
  ```
- [ ] In the browser: sign in as Ana, upload `docs/brief/superdoc-eng-sample-project.docx`, type, open the timeline; open the share link in a private window as Bruno and see both cursors.
- [ ] `railway logs` shows `Naming topics` without an `AI_APICallError`; otherwise the key or the model id is wrong.
- [ ] Redeploy (`railway up --detach`) and confirm the documents survive: the volume holds.

## 6. Hand it over

Fill the Live demo URL in `README.md` and send the URL, the repository link and the demo password in the delivery message.

## 7. Roll back

`railway redeploy` on the previous deployment in the dashboard, or `git revert` and `railway up`. The volume is untouched by a redeploy.

## 8. Back up and reset

Backup: `railway ssh -- tar czf - /data > backup.tgz` while the service runs. Reset: delete the volume in the dashboard and redeploy; the entrypoint seeds the demo users again.

## Failure table

| Symptom | Cause | Fix |
|---|---|---|
| Build ok, health check fails, logs say `SEED_DEMO_USERS must be true or false` | variables not set yet | step 3, then `railway up` |
| Sign-in answers 403 | `APP_ORIGIN` differs from the URL in the browser | step 4 |
| Editor loads, no cursors from the other window | WebSocket blocked or two replicas | one replica only; check `railway status` |
| Topics show "could not be named" | key or model id wrong | `railway logs`, fix the variable |
| Documents vanish after a deploy | volume not mounted at `/data` | step 2 |
| Crash loop, logs say `Database directory is not writable: /data` | the volume is root-owned and the image runs as `node` | `RAILWAY_RUN_UID=0` (step 3) |
| Build log says `railpack prepare exited with an error` | Railway autodetected instead of using the Dockerfile | commit `railway.json` or set `RAILWAY_DOCKERFILE_PATH` (step 3) |
