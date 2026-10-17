# Test plan: Deploy

Executed by the `tester` sub-agent after `tester-briefing.md` exists. Every box states the input and the exact expected outcome; a ticked box carries ` — evidence: <commit | log path | count | screenshot path>`. A box that cannot run is marked `BLOCKED: <why>`, never ticked. The tester never reads `.env`.

**The Docker caveat.** This machine's Docker daemon cannot pull images (`node:24-bookworm-slim` times out; slice 3 test plan). Nothing here runs `docker build`, `docker run` or `docker compose up` locally. `docker compose config` is client-side and runs here. Three kinds of boxes follow:

- **Local** boxes run on this machine and are ticked before the PR opens.
- **CI** boxes are checked from the `docker` job of the draft PR (`gh pr checks`, `gh run view <run id> --log --job <job id>`). Before the PR exists they are marked `BLOCKED: runs on the pull request`; after it runs, the tester ticks them with the run URL and the log line.
- **OWNER** boxes are the owner's acceptance on the VPS after merge, following `docs/features/deploy/runbook.md`. At PR time they are marked `BLOCKED: owner-executed after merge`; the owner (or the lead from the owner's report) ticks them in a docs follow-up.

Production-shaped local run, without Docker, from the repository root (the entrypoint runs the real build exactly as the image does, with `apps/server` as its working directory):

```sh
pnpm build
DIR=$(mktemp -d)
FAKE_OPENROUTER_PORT=3199 node e2e/fake-openrouter.ts                       # background process
cd apps/server && env PORT=3300 APP_ORIGIN=http://127.0.0.1:3300 AUTH_SECRET=deploy-walk-secret-0123456789abcdef0123 DATABASE_DIR=$DIR TRUST_PROXY=true SEED_DEMO_USERS=true DEMO_PASSWORD=deploy-walk-password WEB_DIST_DIR=../web/dist LLM_MODEL=openai/gpt-6-luna OPENROUTER_API_KEY=walk-fake-key OPENROUTER_BASE_URL=http://127.0.0.1:3199/api/v1 sh ../../docker/entrypoint.sh
```

Demo users for the walk, password `deploy-walk-password`, one browser context each: `ana@example.com`, `bruno@example.com`. Screenshots under `.pr-media/deploy/`.

## The failing test first

Each task committed its failing tests alone before the implementation. Check with `git log --format='%h %s' main..HEAD`, `git show --stat <sha>` (test files and the named stubs only), and by checking out the test commit and running `pnpm --filter @superdoc-history/server exec vitest run src/deploy`.

- [ ] Task 0 precondition — input: `git log --oneline -1 main` and the first branch commit; expected: `main` is the PR 4 merge; the first commit is `docs(deploy): add the spec, plan, test plan and ADR 0013`, adding only `docs/features/deploy/{spec,plan,test-plan,tester-briefing}.md`, `docs/adr/0013-deploy-with-dokploy-compose.md`, `docs/adr/README.md`, `docs/features/README.md`
- [ ] Task 1 `test(docker): pin the entrypoint seeding guard and the install layer order` — expected: 5 failed, 4 passed; four entrypoint refusals fail with `AssertionError: expected +0 to be 1`; `installs dependencies from the workspace manifests before copying the sources` fails with `expected [ …(4) ] to not include 'COPY . .'`
- [ ] Task 2 `test(deploy): pin the Dokploy compose file` (with the stub compose) — expected: 9 failed, 3 passed; first failure `expected undefined to deeply equal [ '3000' ]`; the three `refuses to render without …` fail with `expected +0 not to be +0`; the three guards pass
- [ ] Task 3 `test(ci): pin the docker build and boot job` — expected: 2 failed, `expected [ '\n  docker:\n', …(11) ] to deeply equal []` and `to contain '      - run: pnpm test:unit\n        …'`
- [ ] Task 4 `test(deploy): pin the runbook links and variables` (with the stub runbook) — expected: 2 failed, 1 passed; `expected [ 'APP_ORIGIN', 'AUTH_SECRET', …(7) ] to deeply equal []` and, for the anchor case, `expected [ …(2) ] to deeply equal [ Array(1) ]`
- [ ] Task 5 `test(readme): pin the delivery sections and links` — expected: 3 failed, 4 passed; `expected [ 'Live demo', 'Try it', …(5) ] to deeply equal []`, `expected [ Array(3) ] to deeply equal []`, `to contain '](docs/features/deploy/runbook.md)'`
- [ ] Task 6 `test(deploy): pin the secret notes in the example environment` — expected: 3 failed, 7 passed; `expected 'APP_ORIGIN=http://localhost:5173' to match /^# Secret/` and its two siblings
- [ ] Confirmed each fails for the right reason: every failure line is an `AssertionError` naming the missing behaviour, never `Cannot find module`, `ENOENT` or a syntax error

## Unit (`pnpm --filter @superdoc-history/server exec vitest run src/deploy`, 33 tests)

`entrypoint.test.ts` (stub `dist/seed.js` and `dist/main.js` that print a line each; env holds only `PATH` plus the listed variables)
- [ ] `starts the server without seeding or a demo password when seeding is off` — input: `SEED_DEMO_USERS=false`, no `DEMO_PASSWORD`; expected: exit 0, stdout `main ran\n`, stderr empty
- [ ] `seeds the demo users and then starts the server when seeding is on` — input: `SEED_DEMO_USERS=true`, `DEMO_PASSWORD=entrypoint-test-password`; expected: exit 0, stdout `seed ran\nmain ran\n`
- [ ] `refuses to seed without a demo password and starts nothing` — input: `SEED_DEMO_USERS=true`; expected: exit 1, stdout empty, stderr contains `Missing environment variable: DEMO_PASSWORD`
- [ ] `refuses to seed with an empty demo password` — input: `SEED_DEMO_USERS=true`, `DEMO_PASSWORD=`; expected: same as the previous box
- [ ] `refuses to start when the seeding flag is missing` — input: no variables; expected: exit 1, stdout empty, stderr contains `SEED_DEMO_USERS must be true or false, received: ''`
- [ ] `refuses a seeding flag that is not exactly true or false` — input: `SEED_DEMO_USERS=TRUE`; expected: exit 1, stderr contains `received: 'TRUE'`
- [ ] `does not start the server when seeding fails` — input: a seed stub that exits 3; expected: exit 3, stdout empty (`main.js` never ran)

`dockerfile.test.ts`
- [ ] `installs dependencies from the workspace manifests before copying the sources` — expected: `RUN pnpm install --frozen-lockfile` exists, no `COPY . .` above it, one below it
- [ ] `pnpm deploy writes to a folder the repository does not have` — expected: target `release`, and `release/` does not exist at the repository root

`compose.test.ts`: four file-only checks always run; eight checks render `docker compose --env-file /dev/null -f deploy/docker-compose.yml config --format json` with fake Dokploy values inside the block `Dokploy compose file rendered by docker compose (skipped without the Docker CLI)`
- [ ] Without the Docker CLI — input: `PATH` holding only the real `node` binary (`node -p process.execPath`), `git`, `/usr/bin` and `/bin`; expected: `compose.test.ts` reports `4 passed | 8 skipped (12)` and the skipped block's name says why
- [ ] Required but missing — input: the same `PATH` plus `REQUIRE_DOCKER_COMPOSE=true`; expected: the file fails with `Error: Docker Compose v2 is required in CI`, no test passes by skipping
- [ ] With the Docker CLI and `REQUIRE_DOCKER_COMPOSE=true` — expected: `12 passed (12)`, 0 skipped
- [ ] `builds the repository image and reaches the app only through the proxy network` — expected: build context is the repository root, dockerfile `docker/Dockerfile`, `expose` `['3000']`, no `ports`, no `env_file`, no `healthcheck` override, `restart` `unless-stopped`
- [ ] `keeps the data directory on a named volume` — expected: one volume, `type: volume`, `source: superdoc-data`, `target: /data`
- [ ] `pins the production values that must match the image and the proxy` — expected: `PORT=3000`, `DATABASE_DIR=/data`, `WEB_DIST_DIR=/app/web`, `TRUST_PROXY=true`
- [ ] `reads every secret from the Dokploy environment` — expected: `AUTH_SECRET`, `DEMO_PASSWORD`, `OPENROUTER_API_KEY`, `APP_ORIGIN`, `SEED_DEMO_USERS` equal the values passed in
- [ ] `passes optional variables as empty when Dokploy does not set them` — input: only the three required values; expected: the six optional keys render as `''`
- [ ] `refuses to render without APP_ORIGIN` / `AUTH_SECRET` / `SEED_DEMO_USERS` (three cases) — expected: non-zero exit, stderr contains `required variable <NAME> is missing a value`
- [ ] `reads exactly the required and optional variables from the environment` — expected: the nine keys, nothing else
- [ ] `every variable read from the environment is documented in the example file` — expected: none missing from `.env.example`
- [ ] `the example file leaves the OpenRouter key empty` — expected: a line exactly `OPENROUTER_API_KEY=`
- [ ] `no OpenRouter key is committed` — expected: `git grep -nE 'sk-or-v1-[A-Za-z0-9]{16,}'` exits 1

`ci-workflow.test.ts`
- [ ] `a docker job builds the image without pushing it, boots it and restarts it` — expected: the workflow contains the `docker` job, `file: docker/Dockerfile`, `push: false`, `cache-from: type=gha`, the `DEMO_PASSWORD` refusal grep, `/api/health`, `--max-time 5`, `--retry-max-time 120`, `stat -c %u /data`, `/api/auth/sign-in/email`, `docker restart app`, `grep -q 'existing: ana@example.com' app.log`
- [ ] `the verify job requires Docker Compose for the unit tests` — expected: the `verify` job's `pnpm test:unit` step carries `env: REQUIRE_DOCKER_COMPOSE: 'true'`

`delivery-docs.test.ts`
- [ ] `every relative link in README.md points at a file and a heading in the repository` and the same for `docs/features/deploy/runbook.md` — expected: no broken targets; `#anchors` on `.md` targets match a GitHub heading slug of the target (`runbook.md#6-hand-it-over`, `runbook.md#8-back-up-and-reset`, `docs/features/README.md#roadmap`)
- [ ] `a link to a heading its target does not have is reported` — input: `[missing](docs/features/deploy/runbook.md#no-such-heading)` and `[present](docs/features/deploy/runbook.md#6-hand-it-over)`; expected: only the first is reported
- [ ] `the README carries every delivery section` — expected: `Live demo`, `Try it`, `Run locally`, `Run with Docker`, `Deploy (Dokploy)`, `Limits`, `Credits` all present as `##` headings
- [ ] `the README drops the sections that went stale` — expected: no `Status`, `Quick start` or `Citations` heading
- [ ] `the README links the deploy runbook` — expected: `](docs/features/deploy/runbook.md)` present
- [ ] `the runbook sets every variable the compose file reads` — expected: each of the nine keys appears at a line start as `NAME=`
- [ ] `the example file marks AUTH_SECRET as a secret` and the same for `DEMO_PASSWORD`, `OPENROUTER_API_KEY` — expected: the line above each starts with `# Secret`

## Whole gate (local)

- [ ] `pnpm typecheck` — expected: exit 0
- [ ] `pnpm test:unit` — expected: exit 0, the deploy suite included in the `apps/server` count
- [ ] `pnpm test:e2e` — expected: exit 0 (nothing in the app changed; this proves it)
- [ ] `ruby -ryaml -e 'puts YAML.load_file(ARGV[0])["jobs"].keys.inspect' .github/workflows/verify.yml` — expected: `["verify", "docker"]`
- [ ] `sh -n docker/entrypoint.sh` — expected: no output, exit 0
- [ ] Local compose untouched — input: `git diff main...HEAD --stat -- docker-compose.yml`; expected: empty. And `ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose config --quiet` exits 0
- [ ] Local image build — expected: `BLOCKED: this machine cannot pull node:24-bookworm-slim`; the CI boxes are the proof

## Production-shaped local run (no Docker)

- [ ] First start — input: the command in the header; expected: stdout `created: ana@example.com, bruno@example.com, caio@example.com, dani@example.com`, then `existing: `, then `listening on :3300`
- [ ] Health — input: `curl -s http://127.0.0.1:3300/api/health`; expected: `{"status":"ok"}`
- [ ] Sign-in, the runbook's curl shape — input: `curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: application/json' -H 'origin: http://127.0.0.1:3300' -d '{"email":"ana@example.com","password":"deploy-walk-password"}' http://127.0.0.1:3300/api/auth/sign-in/email`; expected: `200`
- [ ] Restart on the same `$DIR` — input: stop the process, run the same command; expected: `created: ` with no names, `existing: ana@example.com, bruno@example.com, caio@example.com, dani@example.com`, `listening on :3300`; the sign-in curl still prints `200`
- [ ] Seeding off on an existing database — input: the same command with `SEED_DEMO_USERS=false` and no `DEMO_PASSWORD`; expected: only `listening on :3300`; health `{"status":"ok"}`
- [ ] Refusal with the real build — input: the command with `SEED_DEMO_USERS=true` and `DEMO_PASSWORD=` removed from the `env` list; expected: exit 1, stderr `Missing environment variable: DEMO_PASSWORD (required when SEED_DEMO_USERS=true)`, no `listening` line, port 3300 free (`curl` fails to connect)

## CI (`docker` job on the draft PR)

- [ ] Build — expected: `docker/build-push-action` step green, no push, cache export line present; build time recorded in the evidence
- [ ] `Refuse to seed without a demo password` — expected: the printed `refusal.log` contains `Missing environment variable: DEMO_PASSWORD`, exit status 1, step green
- [ ] `Start the image on a named volume` — expected: a container id printed, step green
- [ ] `Health answers 200` — expected: `{"status":"ok"}` in the log within the retry budget
- [ ] `The web app is served` — expected: step green (`<title>SuperDoc History</title>` found)
- [ ] `The data volume belongs to the node user` — expected: step green (`stat -c %u /data` is `1000`)
- [ ] `A seeded demo user signs in` — expected: `sign-in status: 200`
- [ ] `Restart keeps the data and the accounts` — expected: health answers again within `--retry-max-time 120`, `app.log` contains `existing: ana@example.com`, `sign-in after restart status: 200`
- [ ] The `verify` job on the same run — expected: green, including the deploy suite inside `pnpm test:unit` on the runner's Compose version
- [ ] Rendering block ran with 0 skipped — input: the `verify` job's `pnpm test:unit` log; expected: `compose.test.ts` lists the eight `Dokploy compose file rendered by docker compose …` tests as passed and the `apps/server` summary shows no skipped tests from `src/deploy`

## Prove it for real — Playwright MCP (the README "Try it" walk, against the production-shaped local run)

- [ ] Happy path, entry to exit, following the README `Try it` steps word for word: sign in as Ana → **Upload .docx** with `docs/brief/superdoc-eng-sample-project.docx` → type a sentence and delete a word → **Share** → copy the edit link; expected: every named button exists with that exact label, the editor shows the brief, the Share dialog shows an edit link
- [ ] Two authors in two browser contexts: Bruno opens the edit link and types; expected: Ana sees Bruno's text and cursor, Bruno sees Ana's
- [ ] **Toggle timeline**; expected: the streamgraph renders, **Top edits** lists Ana and Bruno
- [ ] Filter `@bruno`; expected: the chart, the list and the highlights narrow to Bruno
- [ ] Click a moment on the chart, then **Back to live**; expected: the framed read-only viewer opens, then the live editor returns
- [ ] **Summarize edits** [fake]; expected: a card titled `Summary of these edits` with the fake's sentence
- [ ] **New document**; expected: a blank document opens
- [ ] Empty: a fresh account created through `Create your account`; expected: an empty documents list, no error
- [ ] Reload mid-flow on the editor; expected: the same document reopens with its content
- [ ] Console and network clean: zero console errors; every `/api/*` call 2xx; the `/collaboration` WebSocket answers 101
- [ ] Desktop width 1280×800 and narrow width 375×812; expected: the editor and timeline usable at both, no horizontal page scroll at 375
- [ ] Screenshots at `.pr-media/deploy/` (`try-it-editor.png`, `try-it-timeline.png`, `try-it-summary.png`); no video needed (no UI changed)

## Owner acceptance on the VPS (OWNER, after merge, runbook steps 1–7)

- [ ] OWNER: runbook steps 1–3 done; every "(from memory)" label matched the UI, or the real label is written next to the box for a docs follow-up
- [ ] OWNER: the deploy log has no `required variable … is missing a value`; the service logs show `created: ana@example.com, bruno@example.com, caio@example.com, dani@example.com` and `listening on :3000`
- [ ] OWNER: `curl -s https://<domain>/api/health` prints `{"status":"ok"}`; the certificate is valid (no `-k` needed). A Traefik `404 page not found` in the first ~20 s after the deploy is expected (the container is not healthy yet); note how long it lasted
- [ ] OWNER: on the VPS, `docker ps --filter name=app --format '{{.Ports}}'` shows `3000/tcp` with no `0.0.0.0:` mapping (no host port, so `TRUST_PROXY=true` is safe)
- [ ] OWNER: the runbook's sign-in curl prints `200`; the browser signs in as `ana@example.com` with the demo password over HTTPS
- [ ] OWNER: runbook step 5 in two browsers: Ana uploads the brief, Bruno joins through the edit link, each sees the other's edits within a second; the browser's network panel shows `wss://<domain>/collaboration/…` with status 101
- [ ] OWNER: the timeline shows both authors; a click on a moment opens the old version; **Back to live** returns; **Summarize edits** answers with the real model
- [ ] OWNER: deploy again with no change; expected: logs list the four emails under `existing:`, the brief uploaded before is still in Ana's list (the volume persisted)
- [ ] OWNER: rollback rehearsal, runbook step 7 "pin": `git push origin <main's previous commit>:refs/heads/release/rollback`, branch `release/rollback`, deploy; expected: health `{"status":"ok"}`, Ana's documents still there; then branch `main`, deploy, `git push origin --delete release/rollback`, health `{"status":"ok"}`
- [ ] OWNER: before the repository goes public, from a fresh clone, `git log --all -p | grep -cE 'sk-or-v1-[A-Za-z0-9]{16,}'` prints `0` and `git log --all --oneline -- .env deploy/.env` prints nothing (runbook step 6.2)
- [ ] OWNER: README `- **Demo:**` line replaced with the URL and merged; the repository is public; the delivery message sent with the URL, the GitHub link, the four emails and the password

## Edge cases (planned)

- [ ] `APP_ORIGIN` with a trailing slash — input: the production-shaped command with `APP_ORIGIN=http://127.0.0.1:3300/` and `SEED_DEMO_USERS=false`; expected: exit non-zero, stderr contains `Environment variable APP_ORIGIN must be a bare origin, received: http://127.0.0.1:3300/` (the runbook row is accurate)
- [ ] `SEED_DEMO_USERS=1` — input: the production-shaped command with `SEED_DEMO_USERS=1`; expected: exit 1, `SEED_DEMO_USERS must be true or false, received: '1'`, the server never starts
- [ ] A `$` in the demo password through Dokploy's `.env` — input: a temporary `deploy/.env` with `APP_ORIGIN=https://demo.example.com`, `AUTH_SECRET=ab+c/d=e==fghijklmnopqrstuvwxyz0123456789ABCDEF`, `SEED_DEMO_USERS=true`, `DEMO_PASSWORD=ab$cd-ef`, then `env -i PATH="$PATH" HOME="$HOME" docker compose -f deploy/docker-compose.yml config --format json`, then delete the file; expected: `AUTH_SECRET` renders unchanged and `DEMO_PASSWORD` renders as `ab-ef` (the runbook's no-`$` rule is right, and Compose reads the `.env` beside the compose file)
- [ ] A `release/` folder appears in the repository — input: `mkdir release`, run `dockerfile.test.ts`, `rmdir release`; expected: `pnpm deploy writes to a folder the repository does not have` fails with `expected true to be false` while the folder exists
- [ ] A stray `deploy/.env` — input: a temporary `deploy/.env` holding `AUTH_SECRET=from-stray-env-file-0123456789abcdef`, run `compose.test.ts`, delete the file; expected: 12 passed (`--env-file /dev/null` keeps the test hermetic)

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: "`TRUST_PROXY=true` is safe because the production file publishes no host port" — attack: look for any path that exposes 3000 without Traefik (Dokploy's Advanced → Ports, a `ports:` added later, `network_mode: host`), a Cloudflare-proxied DNS record in front of Traefik, and check `client-address.ts` trusts only the first `X-Forwarded-For` entry; the OWNER `docker ps` box is the on-server proof; result: <refuted | held>
- [ ] Claim 2: "Dokploy's Environment tab reaches `${VAR:?}` interpolation" — attack: the mechanism (`.env` beside the compose file) is proven locally by the `$` edge case; where Dokploy writes the file is from memory; confirm the runbook names the exact signal (`required variable … is missing a value`) and the owner's first deploy box covers it; result: <refuted | held>
- [ ] Claim 3: "A fresh named volume is writable by uid 1000" — attack: the CI step checks a volume created by `docker run -v`; Dokploy creates it through `docker compose` with a project prefix; check that both paths copy the image's `/data` ownership into an empty named volume, and that the runbook's restore keeps uid 1000; result: <refuted | held>

## Coverage honesty

- The image is never built or run on this machine; the CI `docker` job is the only proof before the owner's deploy, and it runs only on the pull request.
- Every Dokploy screen in the runbook is written from memory; only the owner's first deploy confirms the labels, the `.env` location and the Domains tab behaviour.
- Rollback is rehearsed only by the owner on the VPS; no automated test covers it. Backups and restores are manual and untested here.
- The public `AUTH_SECRET` placeholder in `.env.example` passes the server's 32-character check; only the runbook and the example's notes keep it out of production (changing the server is outside this spec).
- Without the Docker CLI the eight compose rendering checks are skipped locally (visibly, by block name); only CI, with `REQUIRE_DOCKER_COMPOSE=true`, guarantees they ran.
- The compose assertions were run on Compose v2.13.0 locally and on whatever version the GitHub runner ships; a future Compose that renders JSON differently fails the suite in CI first.
- WebSockets through Traefik, HTTPS and certificate renewal are proven only by the owner's acceptance boxes.
- The CI smoke uses `TRUST_PROXY=true` without a proxy in front; it proves the image boots with the production flag, not the proxy behaviour.
- Traefik's 404 while a container is starting or unhealthy is from memory; only the owner's first deploy shows how long it lasts.
