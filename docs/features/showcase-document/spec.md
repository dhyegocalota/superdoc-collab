# Showcase document

**Status:** Building
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's request, translated: "A pre-loaded example document with rich history (it can be the brief itself) so it looks like the mock screenshot. The team will test with their own documents, but the first contact will be yours. A DOCX seeded with days of editing by 3 or 4 authors, named topics and marked idle gaps makes the streamgraph appear complete on the first click instead of empty")
**ADRs:** [0020](../../adr/0020-invite-only-accounts-with-a-first-claim-admin.md), [0039](../../adr/0039-the-edits-chart-collapses-idle-stretches-into-marked-breaks.md)
**Not changing:** the import pipeline (`imported-revisions`, `read-model`), the timeline bins, the topics pipeline

## Problem

A fresh install opens on an empty list, and the first document anyone creates has an empty timeline. The first contact with the product should show the streamgraph full: several authors, several days, named topics and marked idle gaps.

## Design (recommended; the owner can override)

- **Content.** `libs/history/src/showcase/showcase-paragraphs.ts` declares the showcase as `SeedParagraph[]` for the existing `buildSeedDocx`: about 25 paragraphs that paraphrase the brief (`docs/brief/superdoc-eng-sample-project.docx`: purpose, requirements, history visualisation, collaboration, AI), each with tracked insertions and deletions by four authors (Ana Lima, Bruno Costa, Caio Souza, Dani Alves) whose `date` values span five working days, three or four bursts a day, every burst separated by more than five minutes so the chart marks the gaps ([ADR 0039](../../adr/0039-the-edits-chart-collapses-idle-stretches-into-marked-breaks.md)). Dates are absolute ISO strings in UTC relative to a `SHOWCASE_START` constant; a helper shifts the whole history so it ends the day before the document is created, so the timeline never shows the future. The imported events carry `imported: true` and the author names; that is the existing attribution path for uploaded Word revisions.
- **Creation.** `ShowcaseDocuments.create({ ownerUserId })` (`apps/server/src/documents/showcase-documents.ts`) builds the DOCX, stores it through `storage.put`, creates the documents row titled `SHOWCASE_TITLE` ("SuperDoc Collab: a guided tour") and calls `runtime.importRevisions`, the same path as an upload. Two callers: (1) the first-claim admin, right after `claimAdmin` succeeds in `sign-up-gate.ts`, so the first person ever to sign in finds it; (2) `POST /api/admin/showcase` for the calling admin, with a `Create the showcase document` button in Admin → Users' heading row, for installs claimed before this change (production). Creating twice makes two documents; the button's description says so.
- **Topics.** Topics are named by the model on first open through the existing pipeline; with no key they show the existing unavailable state. No precomputation.

### Failure handling

| Case | Behaviour |
|------|-----------|
| Storage fails during creation | the documents row is removed, the route answers 500, the claim still succeeds (creation is after the claim and errors are logged, never thrown into the sign-up) |
| Import fails | the document opens without imported events; logged once (existing behaviour) |

## Test strategy summary

Unit: `showcase-paragraphs` has four authors, dates in five distinct days, every consecutive pair of bursts more than five minutes apart, dates all before the creation time after shifting; `ShowcaseDocuments.create` writes the row, the file and schedules the import; the admin route is admin-only and answers 201 with the summary; the first claim creates one showcase. E2E: a fresh stack's first sign-up lands on a list with the showcase; opening it shows the timeline with four contributors and at least one marked gap.
