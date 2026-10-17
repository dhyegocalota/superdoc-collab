# 0019. Deploy the demo on Railway

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [0013](0013-deploy-with-dokploy-compose.md) (the Dokploy compose service this supersedes), [0004](0004-stack.md) (one process, SQLite on a volume), the brief (a deployed demo URL; no managed services except LLM providers)

## Context

ADR 0013 deployed the demo as a Dokploy compose service on a VPS the owner does not own personally: the Dokploy instance belongs to the owner's employer, and a personal take-home should not live there. The owner wants the cheapest host that fits the app as it is: one Node process on one port, three SQLite files plus the uploaded `.docx` files under `/data`, long-lived WebSockets for Hocuspocus, a Docker image already built by CI, and exactly one instance.

Serverless hosts (Vercel, Cloudflare Workers, Lambda, Cloud Run) have no persistent disk for SQLite. A VPS with a self-hosted Dokploy keeps ADR 0013 intact but costs about the same as a managed host in 2026 and adds a server to maintain.

## Decision

- The demo runs on **Railway** as one service built from this repository's `docker/Dockerfile`, with a volume mounted at `/data`, one replica, the health check on `/api/health` and the Railway-provided `*.up.railway.app` domain with TLS. `railway.json` at the repository root declares the builder, the health check and the replica count; the volume and the variables are created in the project.
- The environment is the one `deploy/docker-compose.yml` documents: `PORT=3000`, `DATABASE_DIR=/data`, `WEB_DIST_DIR=/app/web`, `TRUST_PROXY=true` (safe only behind Railway's proxy), `APP_ORIGIN` set to the public URL, `AUTH_SECRET`, `SEED_DEMO_USERS`, `DEMO_PASSWORD`, the OpenRouter variables and the two LLM caps.
- `deploy/docker-compose.yml` stays as the reference for any compose host and for the repository-shape tests; Railway does not read it.
- The container runs as root on Railway (`RAILWAY_RUN_UID=0`): the volume is mounted owned by root and the image's `USER node` cannot write it. The image itself keeps `USER node` for every other host.
- Replicas stay at one. SQLite, the projection worker and the in-memory cooldowns and caps do not survive a second instance ([0004](0004-stack.md), [0011](0011-process-wide-llm-cost-caps.md)).

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Keep Dokploy on the employer's VPS (ADR 0013) | nothing to change | the project would live on infrastructure that is not the owner's | ownership |
| Hetzner VPS with a self-hosted Dokploy | reuses ADR 0013 and the runbook | 2026 price rises put it at the managed hosts' level, plus a server to keep patched; the plan was unorderable at times | cost without the convenience |
| Fly.io | Docker, volumes, WebSockets, free subdomain, similar price | more concepts (machines, regions, autostop) for one demo | Railway is simpler for the same money |
| Render | Docker, disk | disk needs the paid instance; the free tier sleeps and has no disk | pricier for less |
| Oracle Cloud Always Free (ARM) | free | the image is amd64 and two dependencies ship native binaries; an ARM build would need validating | risk for a demo |

## Consequences

- Cost: the Hobby plan's monthly fee returns as usage credit; an idle Node process with a few hundred megabytes stays near the fee.
- Latency: the service region is chosen close to the reviewing team, since live collaboration feels round trips.
- The runbook for this host is `docs/features/deploy/runbook-railway.md`; the Dokploy runbook stays for history.

## Evidence

- `apps/server/src/repository-shape/` keeps rendering `deploy/docker-compose.yml` with the Docker CLI; `railway.json` is validated against Railway's published schema.
- The first deploy's acceptance boxes are in `docs/features/deploy/runbook-railway.md` → "Check it".

## Revisit when

- The app needs more than one instance (then the SQLite and in-memory caps go first, see ADR 0004).
- Railway's pricing or volume limits change, or the owner gets a VPS of their own.
