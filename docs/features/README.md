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
| 1 | [`bootstrap-and-auth`](bootstrap-and-auth/) | workspace, apps, Docker, `/verify` green, Better Auth with seeded users | Building |
| 2 | `documents-and-history` | upload and list DOCX, SuperDoc with live collaboration, history capture and read model | Not started |
| 3 | `timeline-and-time-travel` | streamgraph, filters, top edits, time-travel viewer (spike first) | Not started |
| 4 | `llm-insights` | topic clustering in batch, "Summarize edits" on demand | Not started |
| 5 | `deploy` | Compose on the owner's VPS through Dokploy, delivery README | Not started |
