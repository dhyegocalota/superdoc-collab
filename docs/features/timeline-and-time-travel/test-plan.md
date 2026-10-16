# Timeline and time travel — test plan

Executed by the `tester` sub-agent after `tester-briefing.md` exists. Every box states the input and the exact expected outcome; ticked boxes carry ` — evidence: <commit | log path | count | screenshot path>`. A box that cannot run is marked `BLOCKED: <why>`, never ticked. The tester never reads `.env`; secrets reach processes only through `scripts/with-env.sh`.

Environment for the Playwright MCP walk, from the repository root, production-shaped (SuperDoc only works from the built bundle):

```sh
pnpm build
DIR=$(mktemp -d)
scripts/with-env.sh env PORT=3200 APP_ORIGIN=http://127.0.0.1:3200 AUTH_SECRET=slice-three-test-secret-0123456789abcd DATABASE_DIR=$DIR TRUST_PROXY=false DEMO_PASSWORD=superdoc-demo WEB_DIST_DIR=apps/web/dist node apps/server/dist/seed.js
scripts/with-env.sh env PORT=3200 APP_ORIGIN=http://127.0.0.1:3200 AUTH_SECRET=slice-three-test-secret-0123456789abcd DATABASE_DIR=$DIR TRUST_PROXY=false DEMO_PASSWORD=superdoc-demo WEB_DIST_DIR=apps/web/dist node apps/server/dist/main.js
```

`with-env.sh` supplies `OPENROUTER_API_KEY` and `LLM_MODEL` (real model, owner's key); the `env` overrides keep the walk isolated. For the "LLM failure" boxes restart the same command with `OPENROUTER_API_KEY=` added to the `env` list. Demo users: `ana@`, `bruno@`, `caio@`, `dani@example.com`, password `superdoc-demo`; one browser context per user. Screenshots under `.pr-media/timeline-and-time-travel/`.

## The failing test first

Every task from 1 to 14 commits its failing tests alone in a `test(<scope>): …` commit before its implementation commit. For each box: check out that commit in a worktree, run the named test, record `git show --stat <sha>` (test files only) plus the failure line.

- [ ] Task 2 `test(history): pin version marks, paged events and exact version state` — `version-state.test.ts::every mark restores the document exactly as a full replay at its sequence` fails with "Cannot find module './version-state'", not with a content mismatch
- [ ] Task 6 `test(server): pin the projection throttle, the import lane and version requests` — `projection-throttle.test.ts` fails on the missing module, and `a hanging import does not delay the projection of another document` fails on the 10 s poll timeout (the import lane does not exist yet), not on `mkfifo`
- [ ] Task 9 `test(server): pin exact versions and per-version read-only endpoints` — `a sequence before the bootstrap resolves to the bootstrap version` fails with 404 on `/versions/1` (no route), and `two versions of one document load side by side` fails on the missing `./version-rooms`, not inside a helper
- [ ] Task 13 `test(web): pin time travel, the viewer and scrubbing` — `an at link opens a read-only viewer…` fails because `SuperDoc` is constructed once, not on a missing mock
- [ ] Task 8 `test(server): pin topics, summaries and refresh with a mocked model` — `a twelve-topic answer is saved as eight topics…` fails because `/topics` is 404 or `llm-client` is missing, not on a mock shape error from `MockLanguageModelV4`
- [ ] Every other task (1, 3, 4, 5, 7, 8, 10, 11, 12, 14) has a `test(<scope>): …` commit before its implementation commit — `git log --oneline main..HEAD` lists each pair in that order

## Unit (`pnpm test:unit`)

- [ ] `pnpm typecheck` exits 0 for `libs/types`, `libs/history`, `apps/server`, `apps/web` and `e2e`
- [ ] `pnpm test:unit` runs every package; zero failures; exactly one skipped test (`topics-llm.smoke.test.ts`, no key in the plain run); record the totals per package
- [ ] `poc/` unchanged: `git diff main...HEAD -- poc` prints nothing and `pnpm --dir poc test:unit` passes
- [ ] `version-state.test.ts` — input: 30 edits across about 10 fake minutes, projected in batches of 7; expected: more than 10 marks, and every mark's restored `content` map equals a full replay at its sequence
- [ ] `version-state.test.ts::a delete-heavy history restores exactly at every mark` — input: 40 rounds of 200 inserted and 190 deleted characters on a `Y.Text` plus a story rewrite, one round every 30 fake seconds; expected: the restored `draft` text and `content` map equal a full replay at every mark
- [ ] `version-marks.test.ts` — input: marks at times 10, 70, 130 (sequences 3, 9, 14); expected: `versionSequenceAt(75)` 9, `(5)` 3, `[]` → `null`; `clampToMark(12)` 9, `(1)` 3, `(99)` 14
- [ ] `version-marks.test.ts` — input: the same log with `batchSize: 7`; expected: one bootstrap mark at the bootstrap sequence and no two minute marks with the same `minuteStart`
- [ ] `read-model.test.ts::readPage ends on a sequence boundary` — input: sequences `[1, 1, 2, 3, 3, 3, 4]`, `limit: 4`; expected: `[1, 1, 2, 3, 3, 3]` with `nextAfterSequence: 3`, then `[4]` with `null`
- [ ] `bins.test.ts` — input: spans 2 min, 3 h, 5 h, 30 days, 3 years; expected: bins of 1 min, 2 min, 5 min, 6 h and whole weeks; never more than 120 data bins
- [ ] Edge: `bins.test.ts::a single edit yields three bins, the middle one filled` — input: one run at 10:00:30; expected: bins 09:59, 10:00, 10:01, only 10:00 filled
- [ ] Edge: `runs.test.ts::a term with regex metacharacters matches literally` — input: terms `a.b*(` and `[` over runs `cost a.b*( up` and `aXbb`; expected: only the first run for `a.b*(`, nothing for `[`, no exception
- [ ] `runs.test.ts` — input: deletion run `tegdub` (Backspace order), term `Budget`; expected: match. Input: keystrokes `b,u,d,g,e,t` by Ana in one block and bin; expected: one run `budget`
- [ ] `words.test.ts` — input: `'  plan the  budget '`, `''`, keystrokes forming `'Hello w'`; expected: 3, 0, 2
- [ ] `stack.test.ts` via `bands.test.ts` — input: one band alone; expected: hue 205. Input: `toStackRows` over bins missing a band; expected: that band's value 0 in every row, never `undefined`
- [ ] `bands.test.ts` — input: onsets 30, 10, 20 and an Other band; expected: hues 25, 205, 115 and `null` for Other; a filter that removes the earliest run keeps that band's onset and lowers its volume
- [ ] `topic-assignment.test.ts::twelve topics keep the eight largest in the order the model gave` — expected: `T4`…`T11`
- [ ] Edge: `topic-assignment.test.ts::unknown block ids are dropped and reported` — input: `Budget [b1, gone, b2]`, `Ghost [gone]`; expected: `[Budget [b1, b2]]`, `unknownBlockIds: ['gone']`
- [ ] Edge: `topic-schema.test.ts` — input: no topics, a topic without blocks, `Budget` and ` budget `, a 41-character name, 21 topics; expected: each rejected; 1 and 12 topics accepted
- [ ] `topic-assignment.test.ts::a recomputed topic keeps the id of the topic it mostly covers` — input: previous `t1 [b1, b2, b3]`, `t2 [b4]`; next `Costs [b1, b2, b9]`, `Team [b4, b5, b6]`, `New [b7]`; expected: ids `t1`, `null`, `null`
- [ ] Web: `use-timeline-search.test.ts` — input: `?term=budget&author=ana&at=42&topic=t1`; expected: that exact search object; input: `?at=4x2&term=`; expected: `at` and `term` `null`
- [ ] Web: `parseFilterInput` — input: `@ Ana `, `a.b*(`, `   `, `@`; expected: author `Ana`, term `a.b*(`, `null`, `null`
- [ ] Web: `streamgraph-layout.test.ts` — input: one filled bin between two empty ones; expected: a closed path (`M…Z`) and no label. Input: two thick bands and one thin; expected: labels only for the thick two, vertically at least 16 px apart
- [ ] Web: `streamgraph.test.tsx` — expected: `<title>` and `<desc>` present; every band focusable with `aria-label` `"<name>, <n> characters"`; ArrowRight, ArrowLeft at 0, End and Escape behave as named in the plan
- [ ] Web: `filter-box.test.tsx` — input: `@bruno` Enter, then remove the chip; expected: `?author=bruno`, then an empty search
- [ ] Web: `top-edits.test.tsx` — input: three bands with volumes 30, 0, 90 and summaries for two; expected: rows ordered 90, 30 (the 0 band hidden), chips coloured with each band's hue, at most three avatars, `+N words −M words`, the sentence under its topic only
- [ ] Web: `timeline-panel.test.tsx` — input: `projection.lagMs` 12000, then 2000; expected: "History is catching up · 12 s behind", then no notice
- [ ] Web: `timeline-panel.test.tsx` — input: Retry clicked by an editor on failed topics; expected: one POST to `/topics/refresh` and a second `/timeline` request (invalidated); a reader sees no Retry
- [ ] Web: `timeline-panel.test.tsx` — input: the panel collapsed, `TIMELINE_POLL_MS` elapsed (fake timers); expected: no new `/timeline` request
- [ ] Web: the resize separator — input: ArrowLeft three times from the default width; expected: `aria-valuenow` grows by 72 px; ArrowRight never takes it below 420
- [ ] Web: `time-travel.test.tsx` — input: `?at=42`, 202 then 200; expected: a second SuperDoc with `documentMode: 'viewing'`, `roomMode: 'join'`, `documentId: 'doc-1'` (the document's own id) and `serverUrl` ending in `/collaboration/versions/doc-1/42`; Back to live clears `at`, destroys only the viewer, and the live editor is no longer `inert`
- [ ] Edge: `time-travel.test.tsx::an inaccessible document never requests a version` — input: document 404 with `?at=42`; expected: "This document is no longer available" and zero requests containing `/versions/`
- [ ] Web: scrubbing — input: three ArrowRight presses within 100 ms (fake timers); expected: one URL change after 300 ms; the first travel pushes a history entry, the next ones replace it
- [ ] Web: `highlight-edits.test.ts` — input: runs `' a'`, `' a designer'` twice, `'more money'`, a deletion-only run; expected: comments `c1`–`c3` with `HIGHLIGHT_COMMENT_TEXT`, `query.match` called once per distinct target, longest first; a change of runs deletes the previous ids before creating new ones; unmount deletes them

## Integration (real HTTP and sockets, Vitest)

- [ ] `/timeline` with two authors in `b0` and `b1` and no LLM — expected: two bands of kind `author` named after the users, `topics.state` `failed` with "Topics are unavailable: LLM_MODEL is not set on the server."
- [ ] `/timeline` with stored topics naming `b0` only — expected: bands `Budget (topic)` and `Other (other)`; the editor's characters in Other
- [ ] `/timeline?author=<editor email in upper case>` — expected: same bin starts as unfiltered; contributors only the editor
- [ ] `/timeline?term=DESIGNER` — expected: only the editor's band has volume; `?term=a.b*(` → 200 and every volume 0
- [ ] `/timeline?binMs=61000` → 400; `?binMs=120000` → 200 with `binMs: 120000`; every non-padding bin's `versionSequence` is one of the document's marks
- [ ] `/timeline/edits?binStart=<edit bin>&binMs=60000` — expected: runs `' more money'` and `' a designer'`; an empty bin → `runs: []`; no `binStart` → 400
- [ ] `/events?limit=1` — expected: all events of the first sequence and `nextAfterSequence` equal to it; following the cursor to `null` returns every event exactly once; `limit=0` and `limit=501` → 400
- [ ] `/events` without `limit` — expected: at most 500 events plus the rest of the last sequence, and `nextAfterSequence` set only when more exist
- [ ] Projection status — input: `scheduler.degraded = true` and one more write; expected: `projection.isDegraded` and `isBehind` true, `lagMs` a positive number
- [ ] Topics, mocked model answering 12 topics over 12 blocks — expected: `ready`, 8 topics; the recorded prompt contains no `@example.com`
- [ ] Topics, mocked model naming `gone-1`, `gone-2` — expected: `ready` with `Budget`, and exactly one `console.warn` line starting with the unknown-blocks message
- [ ] Topics, mocked model answering `not json` — expected: `failed` with "The topics could not be named. Try again."; the provider's text appears only in the server log
- [ ] Topics: five new unassigned blocks after a ready set — expected: one extra model call on the next `/timeline` read, none on a second read during that run
- [ ] First open — input: two concurrent `GET /topics` on a document without topics; expected: exactly one model call and both answers `pending`, then `ready`
- [ ] `POST /topics/refresh` — expected: editor 202, reader 403, stranger 404; same user twice within 30 s → 429 "Topics were refreshed a moment ago. Try again in a few seconds."; a refresh during a run → 202 and no second model call
- [ ] Refresh without an LLM — expected: 202, then `failed` with the configuration reason; the server log has one line, no stack trace
- [ ] `GET /summaries` as a reader → 200 `{ summaries: [] }` before any topic exists; no model call
- [ ] Summaries — expected: one model call for two stale topics, two sentences stored; a second read without edits → no call; an edit inside 60 s → no call until the interval passes
- [ ] Versions property test — input: 8 fake minutes of edits; expected: for every mark, `/versions/:sequence/text` equals the text of a full replay at that sequence
- [ ] Edge: `GET /versions/1` before the bootstrap — expected: 202 with `Retry-After: 1`, then 200 whose `sequence` is the bootstrap mark; a provider on its `collaborationPath` syncs the bootstrap text
- [ ] A version endpoint — input: the owner connects on `/collaboration/versions/<id>/<seq>`, inserts text and sets awareness `userId`; expected: `updates`, `client_identities` and `version_marks` counts and `roomMode` unchanged
- [ ] Two versions of one document — input: providers on the first and the last mark at once; expected: the bootstrap text and the edited text respectively, and two live instances
- [ ] Version instances — input: policy `{ idleMs: 200, limit: 32 }`, connect then close; expected: the instance count polls to 0. Input: `limit: 2`, three versions opened; expected: 2 instances and the first viewer closed. Input: a provider naming another document's room on the endpoint; expected: refused
- [ ] Upgrade paths — input: `/collaboration/versions/<uuid>/0`, `/-1`, `/1.5`, `/42/x`, `/abc` and a non-uuid id; expected: the upgrade socket destroyed
- [ ] Non-member on `/versions?around`, `/versions/:seq`, `/versions/:seq/text`, `/timeline`, `/timeline/edits`, `/topics`, `/summaries` — expected: 404 with a body equal to a random uuid's; the version endpoint socket refused
- [ ] `GET /versions/1` on a never-projected document → 409 `{ error: "VERSION_NOT_READY" }`; `/versions/abc` → 400
- [ ] Delete with a connected version viewer — expected: 204 and the viewer's provider receives a close
- [ ] Projection: every logged update reaches `throttle.request`; 1001 inserts produce a heavy snapshot written by the worker within 15 s
- [ ] Import lane: an import blocked on a FIFO does not delay another document's events (visible within 10 s, before the 30 s import timeout)
- [ ] Version requests for one mark share one worker message; an unknown mark rejects; a degraded scheduler rejects at once; a terminated worker re-posts a waiting version

## E2E (Playwright specs, `pnpm test:e2e`, fake OpenRouter)

- [ ] `two authors type in two topics and the bands appear` — Ana and Bruno type in Budget and Hiring; expected: bands Budget and Hiring, Top edits with "Edits about Budget." and Bruno's avatar under Hiring
- [ ] `filter by username hides the other author` and `filter by term survives a reload` pass
- [ ] `a band appears while the other author is still typing` — expected: Ana's Hiring volume grows at least twice before Bruno stops typing, without reload
- [ ] `topics unavailable shows author bands` — expected: "Topics unavailable", bands Ana and Bruno, Retry for the owner
- [ ] `keyboard moves the selected bin` and `narrow viewport stacks the panel` pass
- [ ] `the first bin opens the document as uploaded and Back to live returns` — expected: viewer text equals `/versions/<at>/text` and lacks ` More money`; typing in the viewer changes nothing; after Back to live the live editor shows and accepts typing
- [ ] `highlights stay local to one viewer` — expected: Ana's viewer paints ` More money` as a comment highlight, Bruno's viewer of the same `at` shows none, and `/events` and `/versions?around` counts are unchanged; `the live editor is untouched by a viewer of the same document` passes
- [ ] `the edit bin shows the edit and lists it`, `a shared at link opens the same version for another member`, `a non-member opening an at link sees the document is unavailable`, `Browser Back from a version returns to live` pass
- [ ] The whole suite passes twice in a row with `retries: 0`, slice 1 and 2 specs included

## Prove it for real — Playwright MCP

- [ ] Happy path, three users: Ana uploads a document with four headed sections (`Budget:`, `Hiring:`, `Scope:`, `Risks:`), shares edit links with Bruno and Caio; the panel opens on the right at 40% width; within about 30 s the real model names 4–8 topics shown as labelled bands; each author types in a different section and their band grows within about 5 s — `01-panel.png`, `02-three-authors.png`
- [ ] Top edits: every listed topic shows its chip colour matching its band, at most three avatars, `+N words −M words` and one sentence that mentions what changed — `03-top-edits.png`
- [ ] Refresh topics (owner): the notice says "Naming topics…", then bands are renamed; a second click within 30 s shows the cooldown message
- [ ] LLM failure: restart with `OPENROUTER_API_KEY=` → "Topics unavailable" with the configuration reason, author bands, Retry visible to Ana and Bruno, not to a reader — `04-topics-unavailable.png`
- [ ] Filters: `@caio` narrows chart and panel to Caio; `budget` narrows to runs containing it; copy the URL into Dani's context (after Dani accepts a read link) → the same filtered view
- [ ] Rejected input: filter `a.b*(` and `[` → "No edits match" with Clear filters, no console error; a 300-character entry is cut to 200
- [ ] Empty: a new blank document → "No edits yet", no chart, no console error
- [ ] Single: one edit → three bins, one closed band, no label overflow — `05-single-edit.png`
- [ ] Many: two minutes of continuous typing by three authors → the chart re-renders smoothly every 3 s, labels never overlap and never leave their band — `06-many.png`
- [ ] Time travel: click the earliest bin → banner "Version at HH:MM · Back to live", the viewer shows the document as uploaded, read-only (typing does nothing), the panel lists that bin's edits; select an edit bin → its inserted text is painted in the viewer and no comment sidebar appears; drag across the chart → the banner follows, the previous version stays visible while the next loads — `07-version.png`
- [ ] Tooltip: hovering a band shows the bin's time range, the band name, `+inserted −deleted` characters and the contributors' names; it never covers the pointer and disappears on leave
- [ ] Scrubbing faster than versions load (DevTools CPU 6× slowdown) → never a blank editor area; the final version matches the last bin dragged to
- [ ] Browser Back mid-flow: from a version press Back → live editor, no `at`; Forward → the same version
- [ ] Reload mid-flow: reload on `?term=budget&at=<n>` → same filter, same version, banner time unchanged
- [ ] Two authors in two contexts: while Ana views a version, Bruno keeps typing; Ana's chart keeps growing, her viewer does not change, Back to live shows Bruno's text
- [ ] Latency / disconnect: Bruno offline (CDP) while typing, then online → his band catches up within 5 s of reconnecting; "History is catching up" never sticks after recovery
- [ ] Access: Dani (no membership) opens Ana's `?at=` URL → "This document is no longer available", and the network log has no `/versions/` request
- [ ] Delete while viewing: Bruno views a version while Ana deletes the document → Bruno's page shows "This document is no longer available" within about 5 s; no error loop in the console
- [ ] Console and network clean: zero console errors; every `/api/*` call 2xx or 202, except the deliberate 404, 409 and 429; the server log has no error line other than the deliberate LLM failure
- [ ] Desktop 1440 px: editor and panel side by side, separator drags the panel between 420 px and the editor's minimum; keyboard arrows on the separator resize it — `08-desktop.png`
- [ ] Keyboard only: Tab reaches the chart's bands, each announced with name and characters; arrows move the rule and the version opens 300 ms after the last arrow; Escape returns to live; the separator and filter chips are reachable — `10-keyboard.png`
- [ ] Render cost: Performance panel over three polls with 8 bands and about 120 bins (two hours of seeded edits with `?binMs=60000`) → each chart re-render well under 16 ms (the spike measured 0.7–0.9 ms median); record the measured time
- [ ] Docker: `docker compose up --build -d`, sign in, open a document → panel visible, topics `failed` with the configuration reason (no key in compose), author bands; `docker compose down -v`
- [ ] Narrow 375 px: the panel stacks below the editor at full width, chart fits without horizontal page scroll (`scrollWidth <= 375`), filter and Top edits reachable — `09-narrow.png`
- [ ] Screenshots under `.pr-media/timeline-and-time-travel/`; video by the `recorder`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and asks the owning developer for a regression test.

## Adversarial review

The `reviewer` refutes the three claims most likely to be wrong:

- [ ] Claim "a version endpoint never writes anything" — attack: a raw provider with the editor's cookie on `/collaboration/versions/<id>/<seq>` sends updates and awareness with its own `userId`, then tries `/0`, `/-1`, `/<seq>/1`, another document's id on the path while naming this document's room, and a reader whose membership was never granted; compare `updates`, `client_identities` and `version_marks` before and after — result: <refuted | held>
- [ ] Claim "the viewer shows exactly the document at the bin's end" — attack: pick three bins, read `/versions/<at>/text`, rebuild the text from `/events` up to that sequence by hand, and compare with the viewer's DOM text — result: <refuted | held>
- [ ] Claim "prompts never contain emails or other documents" — attack: capture every request to OpenRouter (fake server log in E2E), search for `@example.com`, another document's title and any block id not in the document — result: <refuted | held>

## Coverage honesty

- SSE is not built; polling every 3 s is the transport (the hook isolates it).
- Runs split at bin edges, so a word typed across a bin boundary is not found by a term; backspaced text is matched reversed but shown as stored.
- Imported revisions months older than live edits stretch the span, so live edits share a few wide bins; a "live only" range is slice 4 polish.
- Documents projected before this slice have version marks only from their next projected batch.
- Viewer highlights are temporary comments (spike §2b); only inserted text of at least three characters is painted, deletions appear in the panel list only.
- One read-only Hocuspocus instance per open version: memory is bounded by the instance limit (32), not measured under many concurrent viewers.
- Summaries can lag their topic by up to 60 s by design.
- The real model is exercised only by the smoke test with the owner's key and by the MCP walk; topic quality is judged by eye, never asserted.
- The fake OpenRouter proves the wire format of one provider version; a provider upgrade can break E2E without breaking unit tests.
- Chaos (proxy cuts, server SIGKILL) and multi-instance servers stay out of scope; the spec of this slice does not ask for them.
