# 0008. Deliver the product as five vertical slices

- Status: Accepted
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [HARNESS](../../.claude/HARNESS.md) → Plan; [0003](0003-time-travel-with-native-yjs-snapshots.md) (spike risk); [0004](0004-stack.md)

## Context

Every feature gets its own `docs/features/<slug>/` folder, a developer → tester → reviewer cycle and a pull request with recorded evidence. The product has several independent risks: SuperDoc collaboration in our own stack, server-side history capture, the time-travel spike, LLM output quality and the deployment with WebSockets and persistent SQLite. The slicing decides how big each pull request is and how early each risk is met.

## Decision

Five slices, built in this order, each with `spec.md`, `plan.md`, `test-plan.md` and its own pull request:

| # | Slug | Delivers | Risk retired |
|---|------|----------|--------------|
| 1 | `bootstrap-and-auth` | pnpm workspace, `apps/web`, `apps/server`, `libs/*`, Docker, `/verify` green, Better Auth with seeded users, login | toolchain, auth on HTTP and on the socket |
| 2 | `documents-and-history` | upload and list DOCX, open in SuperDoc with live collaboration, history capture ported from the POC, read model in a worker | SuperDoc v2 in our stack, authorship, projection |
| 3 | `timeline-and-time-travel` | streamgraph, filters, top edits, time-travel viewer | the spike in 0003, interaction design |
| 4 | `llm-insights` | topic clustering in batch, "Summarize edits" on demand | output quality, cost, provider abstraction |
| 5 | `deploy` | Compose on the owner's VPS through Dokploy, README of delivery | WebSockets behind Traefik, SQLite volume, demo URL |

The order follows risk: the most uncertain vendor behaviour (slices 2 and 3) comes before polish. Slice 4 can shrink without breaking anything else if time runs short.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| One feature folder for the whole product | One document, one view of the whole | One unreviewable pull request, a sixty-step plan, a ten-minute video; one blocker stalls everything | Defeats the review and evidence process |
| Eight finer slices (auth, documents, history, timeline, time travel, LLM, deploy, bootstrap apart) | Smallest pull requests | Eight cycles of ceremony for a two-week take-home; bootstrap alone has nothing to demo | Owner chose fewer, still demonstrable slices |
| Technical layers (server, libraries, web, infrastructure) | Mirrors the code layout | No layer is demonstrable alone; integration risk moves to the end | The product is judged on the demo |

## Consequences

- `docs/features/README.md` carries the roadmap table with slice status.
- Cross-cutting design decisions keep living in ADRs; each slice spec links the ADRs it depends on.
- Slice 3 starts with the spike from 0003; its outcome may change the slice's scope, which is recorded in that spec.

## Evidence

Owner decision on 2026-10-16 after comparing the three options.

## Revisit when

A slice's plan exceeds roughly twenty steps or its pull request stops being reviewable in one sitting: split it and record the split here as a superseding ADR.

## Addendum 2026-10-16

Owner decision after slice 2: the streamgraph bands are LLM-named topics from the start, so topic naming and the per-topic summary sentence of the "Top edits" panel move from slice 4 into slice 3. Slice 4 keeps the on-demand "Summarize edits" (summary of the filtered or selected range) and polish. Slice 3 therefore carries the Vercel AI SDK integration (ADR 0006) and the time-travel spike (ADR 0003).
