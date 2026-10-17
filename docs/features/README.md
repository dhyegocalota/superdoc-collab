# Features

One folder per feature or fix: `docs/features/<slug>/`. Slugs are kebab-case, without dates.

## Required files

`spec.md`, `plan.md` and `test-plan.md` are required together. Never one without the others. `tester-briefing.md` is written by the developer when the build ends.

## Start a new one

Use the `feature` skill, or copy [`_template/`](_template/) to `docs/features/<slug>/` by hand.

## Rules

- A fix gets the same folder. Its spec may be ten lines; it still exists.
- Folders stay after shipping. They are the history of why the code is the way it is.
- The first line of `spec.md` after the title is the status line: `**Status:** Draft | In review | Approved | Building | Shipped YYYY-MM-DD`.
- Order of approval: spec approved by the owner, then plan, then test plan, then code.
- Process details: [`.claude/HARNESS.md`](../../.claude/HARNESS.md).

## Roadmap

Five vertical slices, in build order ([ADR 0008](../adr/0008-vertical-slices.md)). Each slice has its own folder and pull request.

| # | Slice | Delivers | Status |
|---|-------|----------|--------|
| 1 | [`bootstrap-and-auth`](bootstrap-and-auth/) | workspace, apps, Docker, `/verify` green, Better Auth with seeded users | Shipped 2026-10-16 ([PR #1](https://github.com/dhyegocalota/superdoc-take-home/pull/1)) |
| 2 | [`documents-and-history`](documents-and-history/) | upload and list DOCX, SuperDoc with live collaboration, history capture and read model | Shipped 2026-10-16 ([PR #2](https://github.com/dhyegocalota/superdoc-take-home/pull/2)) |
| 3 | [`timeline-and-time-travel`](timeline-and-time-travel/) | streamgraph by LLM topics, filters, top edits with per-topic summaries, time-travel viewer (spike first) | Shipped 2026-10-16 ([PR #3](https://github.com/dhyegocalota/superdoc-take-home/pull/3)) |
| 4 | [`llm-insights`](llm-insights/) | "Summarize edits" on demand for the filtered selection, polish | Shipped 2026-10-16 ([PR #4](https://github.com/dhyegocalota/superdoc-take-home/pull/4)) |
| 5 | [`deploy`](deploy/) | Compose on the owner's VPS through Dokploy, delivery README | Shipped 2026-10-17 ([PR #5](https://github.com/dhyegocalota/superdoc-take-home/pull/5)) |

Refinement after the five slices:

| Fix | Closes | Status |
|-----|--------|--------|
| [`known-minors`](known-minors/) | Escape out of the editor and the version frame, pending-topics notice with bands, summary staleness on any edit, comma names in summary authors | Shipped 2026-10-17 |
| [`refinement-structure`](refinement-structure/) | Prettier, the version viewer in `features/versions`, one date-time formatter, `repository-shape` and `testing` folder names | Shipped 2026-10-17 ([PR #9](https://github.com/dhyegocalota/superdoc-take-home/pull/9)) |
| [`spec-only-rulings`](spec-only-rulings/) | Bin budget overshoot fixed, ADRs 0015–0017 for the rulings that lived only in specs, `NB ADR` pointers in code | Shipped 2026-10-17 ([PR #10](https://github.com/dhyegocalota/superdoc-take-home/pull/10)) |
| [`faster-ci`](faster-ci/) | CI wall time from 15 min to about 4: parallel E2E, independent jobs, prebuilt projection worker in tests | Shipped 2026-10-17 ([PR #12](https://github.com/dhyegocalota/superdoc-take-home/pull/12)) |
| [`security-gates`](security-gates/) | Production dependency audit and secret scan in CI, Dependabot security updates, a `security-reviewer` role as `/open-pr` gate 3b ([ADR 0022](../adr/0022-mechanical-security-gates-and-a-security-reviewer.md)) | In review |
| [`scenario-runs`](scenario-runs/) | `/scenario <slug>`: the stack on its own ports, one Playwright MCP server per author, `docs/scenarios/core-realtime.md`, suggestion before the merge ([ADR 0023](../adr/0023-agentic-scenario-runs-with-one-browser-per-author.md)) | In review |
| [`test-stacks-bind-loopback`](test-stacks-bind-loopback/) | Optional `HOST`; the E2E, scenario and in-process test stacks bind 127.0.0.1 (ADR 0023 → Revisit when) | Shipped 2026-10-17 ([PR #36](https://github.com/dhyegocalota/superdoc-collab/pull/36)) |
| [`editor-survives-rejected-edits`](editor-survives-rejected-edits/) | A SuperDoc `edit-rejected` payload (a keystroke aimed at a paragraph another author deleted) shows a status line instead of the fatal message (defect 1 of the first scenario walk) | In review |
| [`pruned-version-resolves-to-its-minute`](pruned-version-resolves-to-its-minute/) | `/versions/<sequence>` resolves a pruned sequence to the surviving mark of its minute through the update log ([ADR 0027](../adr/0027-a-pruned-version-sequence-resolves-to-its-minute.md)); the time-travel E2E flake was this race | In review |
| [`refinement-tests`](refinement-tests/) | 84 tests removed or folded with nothing lost, 9 rewritten to assert outcomes instead of classes, constants or real waits, two dead library modules deleted | Shipped 2026-10-17 ([PR #11](https://github.com/dhyegocalota/superdoc-take-home/pull/11), evidence [PR #13](https://github.com/dhyegocalota/superdoc-take-home/pull/13)) |
| [`refinement-readability-server`](refinement-readability-server/) | Server names, a split `startServer`, one handler per projection request kind, shared `LruMap`, `KeyedCooldown`, `SlidingWindow`, `withTimeout` and `retryLater` | Shipped 2026-10-17 ([PR #17](https://github.com/dhyegocalota/superdoc-take-home/pull/17)) |
| [`refinement-ux-care`](refinement-ux-care/) | The UX audit's P1 and P2 items and five P3 items: home link, explained chart, collapsed rail, one-date bin ranges, labelled units, phone header, loading states, dialog care, copy rules | Shipped 2026-10-17 ([PR #18](https://github.com/dhyegocalota/superdoc-take-home/pull/18)) |
| [`refinement-readability-web`](refinement-readability-web/) | `useTimeTravel` and `TimelinePanel` split, one web API layer for pollers and query keys, both auth pages rebuilt on shared parts | Building |
| [`package-readmes`](package-readmes/) | READMEs for every package and `e2e`, a Stop hook that names the docs describing a change, link checks on every README | Shipped 2026-10-17 ([PR #19](https://github.com/dhyegocalota/superdoc-take-home/pull/19)) |
| [`e2e-only-when-it-matters`](e2e-only-when-it-matters/) | Suggest the CI E2E run before a merge only when the diff can change what the suite exercises | Shipped 2026-10-17 |
| [`invite-only-access`](invite-only-access/) | First sign-up claims the instance as admin, single-use invite links, `/admin`, no seed in production, newcomer README with an agent install prompt | Shipped 2026-10-17 ([PR #23](https://github.com/dhyegocalota/superdoc-collab/pull/23)) |
| [`timezone-preference`](timezone-preference/) | Preferences page, the zone always visible, one zone-aware formatter, timeline bins aligned to the reader's zone across DST | Shipped 2026-10-17 ([PR #33](https://github.com/dhyegocalota/superdoc-collab/pull/33)) |
| [`sign-in-next`](sign-in-next/) | Signing in follows `?next=` instead of always opening documents | Shipped 2026-10-17 ([PR #32](https://github.com/dhyegocalota/superdoc-collab/pull/32)) |
| [`faster-ci`](faster-ci/) | CI wall time from 15 min to about 4: parallel E2E, independent jobs, prebuilt projection worker in tests | Building |
| [`cleanup-docs`](cleanup-docs/) | `poc/` removed, the root README down to one screen and one screenshot, package READMEs without source references | Shipped 2026-10-17 |
| [`readme-purpose-only`](readme-purpose-only/) | READMEs carry purpose only; the root Run it block is pinned to package.json, .env.example and the workspace by a repository-shape test | Shipped 2026-10-17 |
| [`agentic-history-mcp`](agentic-history-mcp/) | A remote MCP server any AI client connects to as a real person through OAuth: read the history, edit in tracked mode, export, share; every AI edit marked "Name · AI"; revocable connected apps | Approved |
| [`agent-doctor`](agent-doctor/) | `doctor.sh`: one executable list of the tools the harness needs, run at session start, as `/verify` gate 0 and on CI; guards fail closed without `jq`; "Develop with an agent" in `docs/install.md` ([ADR 0027](../adr/0026-the-agent-repairs-its-own-machine-doctor-reports-never-installs.md)) | Shipped 2026-10-17 ([PR #37](https://github.com/dhyegocalota/superdoc-collab/pull/37)) |
| [`agent-install-file`](agent-install-file/) | The agent install prompt is one sentence that points at `docs/agent-install.md`; the README's Quick install offers the agent and Docker, and running from source moves to `docs/install.md`, still pinned by the repository-shape tests | Shipped 2026-10-17 |
| [`gate-by-path`](gate-by-path/) | `pnpm verify` runs what the diff can break, once per commit; a docs lane; the gate is local ([ADR 0030](../adr/0030-the-local-gate-runs-what-the-diff-can-break.md)) | Shipped 2026-10-17 |
| [`test-setup-and-dependabot`](test-setup-and-dependabot/) | The Vitest setup file joins `apps/web/src/testing/`; a pnpm override lifts the deprecated `@esbuild-kit` loader under `drizzle-kit` to `esbuild 0.25`; the spike-only `braces` alert is dismissed as tolerable risk | Shipped 2026-10-17 ([PR #42](https://github.com/dhyegocalota/superdoc-collab/pull/42)) |
| [`remove-spikes`](remove-spikes/) | `spikes/` leaves the tree; the SDK room-join results and screenshots move into the agentic history feature folder; a repository-shape test keeps prototype code out | Shipped 2026-10-17 |
