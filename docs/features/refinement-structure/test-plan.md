# Test plan: Refinement — structure

Executed by the tester sub-agent after the developer's briefing. Every box carries ` — evidence: <command output | commit | count>`. No behaviour changed, so the plan is proof of equivalence plus the new layout.

## Equivalence

- [x] `pnpm typecheck` green. — evidence: pnpm typecheck exit 0 (server, web, e2e tsc clean)
- [x] `pnpm test:unit` green with the same test counts as before the lane (libs/types 13, libs/history 80, web 216, server 383 + 2 skipped) plus the two new `format-date-time` tests. — evidence: types 13, history 80, web 218 (28 files), server 383 passed + 2 skipped; web 218 = 216 + 2 new. Note: the plan text says web 214, the briefing says 216 before; actual 218
- [ ] `pnpm test:e2e` green in CI (`verify` job) — evidence: run URL. — BLOCKED: runs on the PR (CI), PR number 9
- [x] `pnpm format:check` green locally and the CI step exists in the `verify` job before typecheck. — evidence: 'All matched files use Prettier code style!'; verify.yml line 34 `pnpm format:check` precedes `pnpm typecheck` (line 35)
- [x] The format commit (`style: format the repository with Prettier`) changes no behaviour: `rg -c "else \{" --type ts` and `rg -c "\?\? " --type ts` totals equal before and after it; the unit totals are equal. — evidence: at 2bdb7c5 and 2bae62f `else {` = 0 and `?? ` = 2 (rg -c summed); esbuild-minified comparison of all 181 changed ts/tsx files: 180 identical, 1 differs (timeline-tooltip.tsx, a JSX `{' '}` added by Prettier at a line wrap, same rendered text); 3 json files only re-wrapped; unit totals equal

## Layout

- [x] `git log --follow --oneline apps/web/src/features/versions/version-frame.tsx` shows the slice 3 history. — evidence: 7 commits: f7647f6, 2bae62f, 0cc23d0, aea7e6b, 586fabd, 4e234d5, c28831f (slice 3 origin)
- [x] `rg -n "features/timeline|\.\./timeline" apps/web/src/features/editor` lists only `document-page.tsx`. — evidence: 2 lines, both in document-page.tsx (lines 8, 9)
- [x] `rg -n "DateTimeFormat" apps/web/src` lists only `lib/format-date-time.ts` and test files. — evidence: 5 lines: lib/format-date-time.ts (2), lib/format-date-time.test.ts (2), features/documents/documents-page.test.tsx (1)
- [x] `ls apps/web/src/features/editor` has no `version-*` or `viewer-*` file; `ls apps/web/src/features/versions` has the four moved files and `time-travel.test.tsx`. — evidence: editor has no version-* or viewer-* file; versions holds version-banner, version-frame, version-view-page, version-viewer, viewer-messages, time-travel.test.tsx, version-view-page.test.tsx, use-run-highlights(.test).ts (five moved source files, not four)
- [x] `ls apps/server/src/repository-shape` has the five tests and `repository-files.ts`; `apps/server/src/deploy` does not exist. — evidence: ci-workflow, compose, delivery-docs, dockerfile, entrypoint tests + repository-files.ts; `ls apps/server/src/deploy`: No such file or directory
- [x] `rg -n "@/test/" apps/web e2e` is empty; `apps/web/src/testing` exists. — evidence: rg output empty; apps/web/src/testing exists
- [x] `docs/learnings/2026-10-17-a-repo-folder-named-deploy-breaks-pnpm-deploy.md` has a new `Revisited` line and the new Anchor. — evidence: Revisited line 6 mentions the move to repository-shape; Anchor line 18 is apps/server/src/repository-shape/dockerfile.test.ts

## User walk (production-shaped stack, scripted Playwright if the MCP is down)

- [x] Sign in, open a document, open a version, Back to live, apply a filter, Summarize: every screen renders as before the lane (compare with the audit screenshots `07`, `12`, `14` in the lead's scratchpad or the PR #3/#4 media). — evidence: scripted Playwright walk passed (25s); screenshots in /private/tmp/claude-501/-Users-dhyegocalota-Projects-superdoc-take-home/4e1bb842-4c6e-4cb5-b154-ebb9b96b46e8/scratchpad/tester-structure/ compared with audit-ux 07, 12, 14: same layout, copy and controls. Differences: band and cursor colours are swapped (orange/blue) and the opened bin differs (mine had edits, audit's was empty); Summarize edits enabled in mine vs disabled in audit 07. Looks like per-run colour assignment and different state, not structure
- [x] The documents table "Updated" column, the chart tooltip range and the version banner show the same formats as before (medium date, short time; banner time-only). — evidence: row text 'Plan Ana Oct 17, 2026, 8:57 AM owner' (medium date, short time); banner 'Version at 8:57 AM' (time-only, today); chart tooltip and range 'Oct 17, 2026, 8:57 AM – Oct 17, 2026, 8:57 AM'
