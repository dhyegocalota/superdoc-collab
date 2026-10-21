# Deploy runbook: Railway

Supersedes the Dokploy runbook (`runbook.md`) per [ADR 0019](../../adr/0019-deploy-on-railway.md). Everything here runs with the Railway CLI from the repository root; the dashboard shows the same objects.

## What gets deployed

One service built from `docker/Dockerfile`, one volume at `/data`, one replica, health check on `/api/health`, public domain `https://superdoc.dhyegocalota.com.br`. `railway.json` declares the builder, the health check and the replica count.

## Before you start

- `brew install railway` (or `npm i -g @railway/cli`), then `railway login` (opens the browser; the owner does this, never an agent).
- An OpenRouter key and a model id (`.env.example` shows the names).

## 1. Create the project and the service

```bash
railway init --name superdoc-collab
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
  --set SEED_DEMO_USERS=false \
  --set AUTH_SECRET="$(openssl rand -base64 48)" \
  --set LLM_MODEL=<model id> \
  --set LLM_MAX_CONCURRENT_JOBS=4 \
  --set LLM_MAX_CALLS_PER_HOUR=240
scripts/with-env.sh sh -c 'railway variables --set "OPENROUTER_API_KEY=$OPENROUTER_API_KEY"'
```

The last line passes the key from `.env` without printing it. `RAILWAY_RUN_UID=0` runs the container as root because Railway mounts the volume owned by root while the image switches to `node`; without it the server exits with `Database directory is not writable: /data`. `RAILWAY_DOCKERFILE_PATH` pins the Dockerfile even when `railway.json` is missing from the upload (`railway up` sends tracked files only). The caps above are demo-day values; ADR 0011's defaults are 2 and 60. `TRUSTED_PROXY_HOPS` is unset on Railway, which means one trusted hop: the client address is the last `X-Forwarded-For` entry, the one Railway's edge added ([ADR 0042](../../adr/0042-the-client-address-is-the-rightmost-trusted-hop.md)). Set it to 2 only if another proxy is put in front of Railway. The seed is test-only ([ADR 0020](../../adr/0020-invite-only-accounts-with-a-first-claim-admin.md)), so production sets `SEED_DEMO_USERS=false` and no `DEMO_PASSWORD`.

**Upgrading a running service.** A service that already runs with `SEED_DEMO_USERS=true` must switch it to `false` BEFORE deploying the invite-only version: the seed would fail on a claimed database and the container would not start.

The invite-only migration turns every existing account into a plain user. The instance is claimed (it has users) but has no administrator, so step 5's `{"claimed":false}` check and step 6 cannot pass. Pick one path after the deploy:

- **Keep the data.** Promote your own account; the earlier accounts stay as plain users with the passwords they had, and removing accounts is not in the product yet. Choose this only when those passwords are private: the seeded demo accounts share `DEMO_PASSWORD`, so if it was ever published, take the clean path instead.

  ```bash
  railway ssh -- node dist/admin-promote.js <your email>
  ```

  Skip step 5's claim check and step 6; open `/admin` signed in as that account.
- **Start clean** (recommended for a public demo that was seeded). Back up (step 9), delete the volume in the dashboard, recreate it at `/data`, redeploy, and continue with step 5 and the claim in step 6.

Size the service's memory before you rely on large files: Railway's service **Settings** → **Resource Limits** (on the Hobby plan, up to 8 GB). A 4 GB service prepares documents with up to about 4 MB of text and layout (the inflated `word/document.xml`, which for a Word file is several times the size of the file) and answers a larger upload with a 413 that names the largest size it can prepare. An 8 GB service prepares up to 12 MB of text and layout, which covers the owner's heaviest 10 MB file (9.5 MiB of text) with little headroom ([measurements](../server-bootstrap/spec.md)). Only the 9.5 MiB document was measured, at 8 GB; the 12 MB and the 4 MB are extrapolations of its ratio. The guard budgets one bootstrap beside the light lane on an otherwise idle server: heavy rooms already loaded and the projection worker's retained heap are not counted, so a server that keeps several heavy documents open needs more memory than these sizes. The container reads its limit itself; do not set `MEMORY_LIMIT_MEGABYTES` or `BOOTSTRAP_HOST_HEAP_MEGABYTES`.

## 4. Domain and origin

```bash
railway domain <your domain> --port 3000
railway variables --set APP_ORIGIN=https://<your domain>
railway up --detach
```

`railway domain` prints a CNAME and a `_railway-verify` TXT record; add both at the DNS host with the proxy off, and set `APP_ORIGIN` only once `railway domain status` reports the certificate issued. `APP_ORIGIN` must match the public URL exactly, or sign-in is refused by the origin check.

## 5. Check it

- [x] `railway status` shows the service with one replica and a volume at `/data`. — evidence: railway status 2026-10-17: Online, volume superdoc-collab-volume at /data (1 MB / 500 MB), region iad; replica count not shown by the CLI
- [x] `curl -s https://<domain>/api/health` answers `200`. — evidence: curl returned 200 on 2026-10-17
- [ ] `curl -s https://<domain>/api/setup` answers `{"claimed":false}` before step 6.
- [x] In the browser, after step 6: upload `docs/brief/superdoc-eng-sample-project.docx`, type, open the timeline; open the share link in a private window as an invited user and see both cursors. — evidence: first walk 2026-10-17 with the former demo accounts; repeat after the claim
- [x] `railway logs` shows no `Naming topics failed` line and no `AI_APICallError`; either one means the key or the model id is wrong. — evidence: no Naming topics failure and no AI_APICallError in railway logs 2026-10-17; topics were named in the UI (Project Brief, Design Inspiration) within 10 s
- [ ] Redeploy (`railway up --detach`) and confirm the documents survive: the volume holds.

## 6. Claim the instance

1. Open `https://<domain>`: the page offers "Claim this instance".
2. Create the administrator account. The first account becomes the administrator and sign-up closes behind it.
3. Open `/admin` → **Generate invite**, copy the link from the dialog and send it. Each link is single use and expires in 7 days.
4. `curl -s https://<domain>/api/setup` now answers `{"claimed":true}`.

## 7. Hand it over

Fill the Live demo URL in `README.md` and send the URL, the repository link and the invite links in the delivery message. Never send a shared password.

## 8. Roll back

`railway redeploy` on the previous deployment in the dashboard, or `git revert` and `railway up`. The volume is untouched by a redeploy.

## 9. Back up and reset

Backup: `railway ssh -- tar czf - /data > backup.tgz` while the service runs. Reset: delete the volume in the dashboard and redeploy; the volume is empty, open the URL and claim again.

## Failure table

| Symptom | Cause | Fix |
|---|---|---|
| Build ok, health check fails, logs say `SEED_DEMO_USERS must be true or false` | variables not set yet | step 3, then `railway up` |
| Container exits at start, logs show the seed refusing a claimed database | `SEED_DEMO_USERS=true` on a service that was already claimed | `railway variables --set SEED_DEMO_USERS=false`, then `railway up` |
| Sign-in answers 403 | `APP_ORIGIN` differs from the URL in the browser | step 4 |
| Editor loads, no cursors from the other window | WebSocket blocked or two replicas | one replica only; check `railway status` |
| Topics show "could not be named" | key or model id wrong | `railway logs`, fix the variable |
| Documents vanish after a deploy | volume not mounted at `/data` | step 2 |
| `/api/setup` says claimed and nobody can open `/admin` after an upgrade | the migration made every existing account a plain user | promote yourself with `railway ssh -- node dist/admin-promote.js <email>`, or reset the volume and claim |
| Crash loop, logs say `Database directory is not writable: /data` | the volume is root-owned and the image runs as `node` | `RAILWAY_RUN_UID=0` (step 3) |
| Build log says `railpack prepare exited with an error` | Railway autodetected instead of using the Dockerfile | commit `railway.json` or set `RAILWAY_DOCKERFILE_PATH` (step 3) |
