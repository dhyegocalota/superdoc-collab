# Refinement: structure Implementation Plan

> **For agentic workers:** executed by one developer sub-agent task by task (subagent-driven-development); steps use checkbox syntax.

**Goal:** format the repository once and move files to where a reader expects them, with no behaviour change.

**Architecture:** pure moves with `git mv` so history follows; one shared formatter module; Prettier enforced in CI.

**Tech Stack:** Prettier 3, pnpm workspaces, Vitest, Playwright.

**Spec:** `docs/features/refinement-structure/spec.md`

## Global Constraints

- No behaviour change: no test assertion edited, no copy edited, no runtime code beyond import paths and the formatter module.
- Every task ends with `pnpm typecheck` green and the touched suites green, then one commit per task; the format commit contains only formatting.
- Stage by path; never `git add -A`.

## Review Focus

1. The format commit must contain no semantic change: `git diff --stat` large, `pnpm test:unit` and `pnpm typecheck` identical before and after; spot-check that no `else {` or `?? ` appeared.
2. The three date formats must stay identical to the eye: medium date + short time; the banner's time-only format keeps `timeStyle: 'short'`.
3. `git log --follow` must show each moved file's history.
4. Vitest `setupFiles` and `include` globs must still find the moved web helpers and the server repository-shape tests (check `apps/web/vite.config.ts` or `vitest.config.ts`, `apps/server/vitest.config.ts`).
5. Documentation that cites old paths (`docs/features/deploy/*.md`, `docs/learnings/2026-10-17-a-repo-folder-named-deploy-breaks-pnpm-deploy.md` Anchor, `.claude/rules/*.md`, `README.md`) is updated or gets a "moved to" note.

---

### Task 1: Prettier, configured and applied once

**Files:**
- Create: `.prettierrc`, `.prettierignore`
- Modify: `package.json` (scripts `format`, `format:check`; devDependency `prettier` pinned to the exact version pnpm resolves), `.github/workflows/verify.yml` (one step `pnpm format:check` before the typecheck step in the `verify` job)

- [x] **Step 1:** `pnpm add -Dw prettier@3` from the repository root; pin the exact version in `package.json`. — evidence: 2bdb7c5
- [x] **Step 2:** write `.prettierrc`: — evidence: 2bdb7c5

```json
{ "printWidth": 140, "singleQuote": true, "semi": true, "trailingComma": "all", "arrowParens": "always", "endOfLine": "lf" }
```

- [x] **Step 3:** write `.prettierignore`: — evidence: 2bdb7c5

```
node_modules
dist
coverage
pnpm-lock.yaml
poc
.pr-media
.superpowers
test-results
*.md
*.yml
*.yaml
*.sql
apps/web/public
```

- [x] **Step 4:** scripts: `"format": "prettier --write ."`, `"format:check": "prettier --check ."`. Add the CI step `- run: pnpm format:check` immediately before the typecheck step of the `verify` job. — evidence: 2bdb7c5
- [x] **Step 5:** run `apps/server` unit tests that pin the workflow (`apps/server/src/deploy/ci-workflow.test.ts`) to confirm the new step breaks none; if one pins the step order by exact text, adjust the step position, never the test. — evidence: 2bdb7c5
- [x] **Step 6:** commit the configuration alone: `chore(format): add Prettier with a 140-column width and check it in CI`. — evidence: 2bdb7c5
- [x] **Step 7:** `pnpm format`, then `pnpm typecheck && pnpm test:unit`; inspect `git diff --stat` and `rg -n "else \{|\?\? " --type ts` counts before and after (must be equal). — evidence: 2bae62f
- [x] **Step 8:** commit the formatting alone: `style: format the repository with Prettier`. — evidence: 2bae62f

### Task 2: the version viewer moves to `features/versions`

**Files:**
- Move: `apps/web/src/features/editor/{version-banner.tsx,version-frame.tsx,version-viewer.tsx,viewer-messages.ts,time-travel.test.tsx}` → `apps/web/src/features/versions/`
- Modify: every importer (`rg -n "editor/(version-banner|version-frame|version-viewer|viewer-messages)" apps/web/src e2e` and relative imports inside `features/editor/document-page.tsx`, `features/versions/version-view-page.tsx`, `features/versions/version-view-page.test.tsx`)

- [x] **Step 1:** `git mv` the five files. — evidence: f7647f6
- [x] **Step 2:** fix imports: in `document-page.tsx` use `@/features/versions/version-banner` and `@/features/versions/version-frame`; in `version-view-page.tsx` and its test use relative `./viewer-messages` and `./version-viewer`; in the moved files turn relative `./collaboration-config`, `./editor-api`, `./superdoc-editor` into `@/features/editor/...` and `../timeline/...` into `@/features/timeline/...`; `time-travel.test.tsx` imports `DocumentPage` from `@/features/editor/document-page` and its sibling helpers from `@/features/editor/editor-api`. — evidence: f7647f6
- [x] **Step 3:** `pnpm typecheck`; `cd apps/web && npx vitest run src/features/versions src/features/editor`. — evidence: f7647f6
- [x] **Step 4:** `rg -n "from '@/features/timeline|from '\.\./timeline" apps/web/src/features/editor` must list only `document-page.tsx` (timeline panel and the time-travel hook) — record the count in the commit body. — evidence: f7647f6
- [x] **Step 5:** commit `refactor(web): move the version viewer into the versions feature`. — evidence: f7647f6

### Task 3: one date-time formatter module

**Files:**
- Create: `apps/web/src/lib/format-date-time.ts`, `apps/web/src/lib/format-date-time.test.ts`
- Modify: `apps/web/src/features/timeline/timeline-tooltip.tsx` (remove `TIMESTAMP_FORMAT`, `formatTimestamp`, `formatBinRange`; import them), `apps/web/src/features/documents/document-table.tsx` (remove `UPDATED_AT_FORMAT`, use `formatTimestamp`), `apps/web/src/features/versions/version-banner.tsx` (remove `DATED_MOMENT_FORMAT` and its time-only format, use `formatTimestamp` / `formatTimeOfDay`), importers of `formatTimestamp`/`formatBinRange` in `streamgraph.tsx`, `bin-edits.tsx`, `streamgraph.test.tsx`, `versions/time-travel.test.tsx`

- [x] **Step 1:** write the failing test: — evidence: e227ebe

```ts
import { expect, test } from 'vitest';
import { formatBinRange, formatTimeOfDay, formatTimestamp } from './format-date-time';

const MOMENT = Date.UTC(2026, 9, 17, 14, 2);
const LATER = MOMENT + 60_000;

test('a timestamp carries the date and the time, a time of day only the time', () => {
  expect(formatTimestamp(MOMENT)).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(MOMENT));
  expect(formatTimeOfDay(MOMENT)).toBe(new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(MOMENT));
});

test('a bin range joins both ends with an en dash', () => {
  expect(formatBinRange({ start: MOMENT, end: LATER })).toBe(`${formatTimestamp(MOMENT)} – ${formatTimestamp(LATER)}`);
});
```

- [x] **Step 2:** run it: fails with "Cannot find module './format-date-time'". Commit the test alone: `test(web): pin the shared date-time formatters`. — evidence: e227ebe
- [x] **Step 3:** create the module by moving the existing functions verbatim (keep the en dash and the exact options); `formatTimeOfDay` wraps the banner's existing time-only `Intl.DateTimeFormat`. — evidence: c3b74ca
- [x] **Step 4:** replace the three duplicate constants and update importers; `pnpm typecheck`; `cd apps/web && npx vitest run`. — evidence: c3b74ca
- [x] **Step 5:** `rg -n "DateTimeFormat" apps/web/src` must list only `lib/format-date-time.ts` and tests. — evidence: c3b74ca
- [x] **Step 6:** commit `refactor(web): share one date-time formatter module`. — evidence: c3b74ca

### Task 4: generic hook to `lib`

- [x] **Step 1:** `git mv apps/web/src/features/timeline/use-element-width.ts apps/web/src/lib/use-element-width.ts`; update the import in `timeline-panel.tsx` to `@/lib/use-element-width`. — evidence: 0bd016e
- [x] **Step 2:** `pnpm typecheck`; commit `refactor(web): move the element-width hook to lib`. — evidence: 0bd016e

### Task 5: server repository-shape tests

**Files:**
- Move: `apps/server/src/deploy/*.test.ts` → `apps/server/src/repository-shape/`; `apps/server/src/testing/repository-files.ts` → `apps/server/src/repository-shape/repository-files.ts`
- Modify: the five imports of `../testing/repository-files` → `./repository-files`; `apps/server/vitest.config.ts` only if it names the folder; docs citing the old path: `docs/features/deploy/{spec,plan,test-plan,tester-briefing}.md` get one line "Moved to `apps/server/src/repository-shape/` on 2026-10-17 (refinement-structure)" under their first heading rather than rewritten history; `docs/learnings/2026-10-17-a-repo-folder-named-deploy-breaks-pnpm-deploy.md` Anchor updated and a `Revisited` line appended; `README.md` if it cites the path (`rg -n "src/deploy" README.md docs .claude`).

- [x] **Step 1:** `git mv`, fix imports, `cd apps/server && npx vitest run src/repository-shape` (compose block skips without Docker; run with `REQUIRE_DOCKER_COMPOSE=true` if `docker compose version` works). — evidence: 893abda
- [x] **Step 2:** docs notes; `pnpm typecheck`. — evidence: 893abda
- [x] **Step 3:** commit `refactor(server): name the repository-shape tests for what they check`. — evidence: 893abda

### Task 6: web test helpers folder

- [x] **Step 1:** `git mv apps/web/src/test apps/web/src/testing`; `rg -l "@/test/" apps/web e2e` → replace with `@/testing/`; check `apps/web/vite.config.ts`/`vitest.config.ts` `setupFiles` and `tsconfig` paths for `src/test`. — evidence: b5cad2e
- [x] **Step 2:** `pnpm typecheck && cd apps/web && npx vitest run`; `rg -n "@/test/" apps/web` must be empty. — evidence: b5cad2e
- [x] **Step 3:** commit `refactor(web): name the test helpers folder like the other packages`. — evidence: b5cad2e

### Task 7: docs

- [x] **Step 1:** add the feature folder (this spec, plan, test plan, tester briefing) and a row in `docs/features/README.md` under "Fixes after the five slices" → rename that table heading to "Refinement after the five slices" and list the lane. — evidence: aa93e2e
- [x] **Step 2:** `pnpm format:check`; commit `docs(refinement-structure): record the lane`. — evidence: aa93e2e
