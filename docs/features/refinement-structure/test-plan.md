# Test plan: Refinement — structure

Executed by the tester sub-agent after the developer's briefing. Every box carries ` — evidence: <command output | commit | count>`. No behaviour changed, so the plan is proof of equivalence plus the new layout.

## Equivalence

- [ ] `pnpm typecheck` green.
- [ ] `pnpm test:unit` green with the same test counts as before the lane (libs/types 13, libs/history 80, web 214, server 383 + 2 skipped) plus the two new `format-date-time` tests.
- [ ] `pnpm test:e2e` green in CI (`verify` job) — evidence: run URL.
- [ ] `pnpm format:check` green locally and the CI step exists in the `verify` job before typecheck.
- [ ] The format commit (`style: format the repository with Prettier`) changes no behaviour: `rg -c "else \{" --type ts` and `rg -c "\?\? " --type ts` totals equal before and after it; the unit totals are equal.

## Layout

- [ ] `git log --follow --oneline apps/web/src/features/versions/version-frame.tsx` shows the slice 3 history.
- [ ] `rg -n "features/timeline|\.\./timeline" apps/web/src/features/editor` lists only `document-page.tsx`.
- [ ] `rg -n "DateTimeFormat" apps/web/src` lists only `lib/format-date-time.ts` and test files.
- [ ] `ls apps/web/src/features/editor` has no `version-*` or `viewer-*` file; `ls apps/web/src/features/versions` has the four moved files and `time-travel.test.tsx`.
- [ ] `ls apps/server/src/repository-shape` has the five tests and `repository-files.ts`; `apps/server/src/deploy` does not exist.
- [ ] `rg -n "@/test/" apps/web e2e` is empty; `apps/web/src/testing` exists.
- [ ] `docs/learnings/2026-10-17-a-repo-folder-named-deploy-breaks-pnpm-deploy.md` has a new `Revisited` line and the new Anchor.

## User walk (production-shaped stack, scripted Playwright if the MCP is down)

- [ ] Sign in, open a document, open a version, Back to live, apply a filter, Summarize: every screen renders as before the lane (compare with the audit screenshots `07`, `12`, `14` in the lead's scratchpad or the PR #3/#4 media).
- [ ] The documents table "Updated" column, the chart tooltip range and the version banner show the same formats as before (medium date, short time; banner time-only).
