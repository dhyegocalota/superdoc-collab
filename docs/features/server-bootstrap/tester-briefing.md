# Tester briefing: Server bootstrap

Written by the developer. Every "it works" below is a hypothesis for the tester to refute.

## What changed

- `apps/server/src/collaboration/room-bootstrap.ts` — the registry: stages, one job at a time, attempts, ready on commit.
- `apps/server/src/history/projection-{messages,handler,queues,scheduler,worker}.ts` — the `Bootstrap` request, its own queue, the SDK client with a long request timeout, a scheduler promise that rejects when the worker dies.
- `apps/server/src/agent/room-tokens.ts` — bootstrap tokens (actor Human, an attempt); agent tokens unchanged.
- `apps/server/src/collaboration/{authenticate-bootstrap,collaboration-server,attach-collaboration,upgrade-path,collaboration-runtime,bootstrap-state}.ts` — the loopback bootstrap path, admission as the owner, the attempt fence, the commit hook.
- `apps/server/src/documents/{documents-routes,store-document,documents-repository}.ts` — the open answer carries `bootstrap`; uploads, blank creates and the showcase start a bootstrap; `ownerOf`.
- Removed: `creator-reservations`, `claimed-ticket`, the reserve and takeover paths, the epoch, `isAttemptSuperseded` and `isAttemptRestarted`, the ticket constants and `CreatorTicket` from `libs/types`.
- `e2e/room-admission.spec.ts` rewritten; `e2e/fixtures/large-docx.ts` gains `buildBrokenDocx`.
- Docs: spec, plan, test plan, ADR 0048, a consequence line in ADR 0033, `.claude/rules/collaboration.md`, the room-admission spec note.

## How to run

```bash
pnpm exec playwright test e2e/room-admission.spec.ts
```

The web build fails on the removed exports until the web lane deletes its uses of the ticket. To run the spec before that merge, add the two `CREATOR_*_QUERY_KEY` exports back to `libs/types/src/routes.ts` for the run only.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|-------------------------------|---------------------|
| `projection-handler.test.ts` bootstrap tests | `handleBootstrap is not implemented` (423756c2) | the handler joins the room and times out (56aed11b) |
| `projection-queues.test.ts` pending bootstrap | the stub queued it behind a project (423756c2) | its own queue (56aed11b) |
| `projection-scheduler.test.ts` bootstrap tests | `bootstrap is not implemented` (423756c2) | a waiter resolved by the reply, rejected by a failure, a crash or a stop (56aed11b) |
| `room-tokens.test.ts` bootstrap tokens | `signBootstrapToken is not implemented` (282fa072) | claims carry the actor and an attempt (e3f3b7fc) |
| `room-bootstrap.test.ts` | `RoomBootstrap.request is not implemented` (950dd8de) | the registry (f108691b) |
| `bootstrap-state`, `upgrade-path`, `documents-repository` additions | red observed locally, committed together with the change (462881c0): a pin of nothing, not a red-first commit | the hook, the path test and `ownerOf` |
| `collaboration-server`, `collaboration-runtime`, `documents-routes`, `members-routes`, `attach-collaboration` | rewritten with the removal, committed together (2a458752) | not a red-first commit |

## Hypotheses to attack

- Only the bootstrap socket writes to an uncommitted room; a stale attempt cannot.
- A failed or lost bootstrap never leaves the open answer in Preparing.
- The first open of an old uncommitted document starts exactly one bootstrap.
- The heavy fixture: 38.9 s to Ready, 13.4 s from page open to the first paragraph, local, one run.

## Hardening after the security and review findings (2026-10-19)

### What changed

- `apps/server/src/history/projection-{handler,worker,queues,scheduler,messages}.ts`, `bootstrap-applied.ts`, `bootstrap-host-environment.ts`: one SDK host and one worker queue per lane, the host disposed after every bootstrap and before the answer, the host's request timeout later than the server's, secrets and the database location removed from the host's environment, a heap cap from `PROJECTION_WORKER_HEAP_MEGABYTES`, a fast failure when the open result did not apply the bootstrap, and a bootstrap posted during a recycle held until the fresh worker exists.
- `apps/server/src/collaboration/room-bootstrap.ts`, `limits/owner-round-robin-queue.ts`: a light lane (files up to `BOOTSTRAP_LIGHT_MAX_BYTES`, 2 MB) and a heavy lane, owners served in turns, a grace of `BOOTSTRAP_COMMIT_GRACE_MS` for the commit after the run resolves, one retry of a run the worker's death interrupted, a Failed bootstrap started again by the first request after `BOOTSTRAP_RETRY_COOLDOWN_MS`, and the attempt ending with the run.
- `apps/server/src/collaboration/{authenticate-bootstrap,collaboration-runtime}.ts`: a committed room refuses a bootstrap socket; an open of a document queued or preparing is answered from the registry without the budget or a log scan.
- `apps/server/src/documents/documents-routes.ts`, `libs/history/src/docx-signature.ts`, `apps/server/src/server.ts`, `config/environment.ts`: 429 with `Retry-After` for a user over `UPLOADS_PER_MINUTE` (an environment knob, default 30) or with a file waiting in the lane of the new one; 415 for a `word/document.xml` that inflates past 64 MB.
- `e2e/`: two waiting-page cases and the identity case describe the server bootstrap, the upload helper waits out a 429, the heavy cases of `room-admission.spec.ts` use their own owners, and one case proves a blank document is ready right after a broken file.
- Docs: spec, plan, test plan, ADR 0048, `.claude/rules/collaboration.md`, the install and runbook variable tables, and a learning about JSZip's `nodeStream` in the bundled server.

### How to run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/collaboration src/history src/documents src/limits src/config
pnpm exec playwright test e2e/room-admission.spec.ts
```

### Red today, green after

Each row of the hardening section of `test-plan.md` names its red and green commit. The first red test of the attempt fence said a ready attempt must stop being current. The green commit ends it when the run ends, because the tests of 13 files write on their bootstrap socket after the commit.

### Hypotheses to attack

- A blank document is ready in under a second while a 10 MB document converts in the other lane (measured: 0.38 to 0.45 s from the create to Ready alone, 1.0 s in the full run, with 250 ms polling).
- A broken file, a timeout and a worker death each leave the next document of the same owner and of another owner unaffected.
- One owner cannot hold more than one waiting bootstrap per lane, and cannot make more than `UPLOADS_PER_MINUTE` uploads in a minute.
- A host that outlives its run, or a token replayed on a committed room, writes nothing.
- A zip that declares a small `word/document.xml` and inflates to gigabytes is refused with bounded memory.

### Gaps I know about

- The heap cap goes through `NODE_OPTIONS`. The SDK binary is a Bun executable, so I did not prove it limits the host. The timeout and the lane remain the bounds.
- `Failed` is started again after a cooldown of 30 s, which the owner's request did not name; a broken file is therefore tried again once every 30 s while someone keeps opening it.
- Heavy timings (alone): Ready 45.5 s after the upload and the first paragraph 15.1 s after the page opens. In the full suite the same file took 65 to 170 s to be Ready because four heavy files share one lane.
- Fixed in `1fdcc380`: an export from a Join editor had a `word/document.xml` without `xmlns:r`, `xmlns:wp` and `xmlns:a`, so the PDF print view could not open it and a DOCX download was damaged. The cause was not the SDK conversion but `apps/web/public/blank.docx`, which declared only `xmlns:w`; a joiner's converter takes its root attributes from that file. It now declares the full Word set, and `final-visuals.spec.ts` "Download PDF of the uploaded brief" passes.


## Memory guard (step 18)

- `libs/types/src/documents.ts`: `BOOTSTRAP_RESIDENT_BYTES_PER_XML_BYTE` (500), `BOOTSTRAP_MEMORY_RESERVE_MEGABYTES` (512), `largestPreparableMegabytes`, `bootstrapMemoryShortMessage`.
- `docker/entrypoint.sh` exports `MEMORY_LIMIT_MEGABYTES`; `environment.ts` parses it (null when unknown); `documents-routes.ts` refuses before storing; `documents-api.ts` shows the server's 413 message.
- Run: `pnpm --filter @superdoc-collab/server exec vitest run src/config src/documents/documents-routes.test.ts`, `pnpm --filter @superdoc-collab/repository-shape test:unit`.
- Red today, green after: the three route and four type tests failed with `... is not implemented` and the environment test with `expected null to be 4096` (494857e2); the entrypoint test failed with `expected '...' to contain 'limit=4096'` (efbef7cb).

Hypotheses to attack:

- At a 4096 MB limit a document with 9.5 MB of `word/document.xml` is a 413 reading `This server can prepare documents with up to 7 MB of text and layout.` however small its file is, and stores nothing; a 2 MB one and a blank create pass the guard.
- With no limit known nothing is refused for memory.
- The upload dialog shows that sentence in its alert.

Gaps:

- A 413 from a proxy with a body that is not JSON shows the upload limit copy.
- The ratio is one measurement of one file; a file with a different shape may use more or less per byte.
- Not rerun in a 4 GB container after the guard; the guard is proved by unit tests on the formula. The ratio comes from a completed 8 GB run (sum of peaks 4,752 MiB over 9.52 MiB of XML).
- Every size rule keys on `documentXmlBytes`: `e2e/room-admission.spec.ts` has a deflated heavy upload that must reach Ready (red before the fix: a light lane and a 19 s timeout).
