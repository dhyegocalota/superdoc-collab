# Test plan: Time zone preference

Every box states the input and the exact expected outcome; ticked boxes carry ` — evidence: `.

## The failing test first

- [ ] `libs/history/src/timeline/zoned-time.test.ts` day bin in America/Sao_Paulo — input `Date.UTC(2026, 9, 17, 2, 0)`; expected `Date.UTC(2026, 9, 16, 3, 0)`; before the build: module missing, then the epoch floor `1792195200000` where `1792119600000` is expected.

## Unit

- [ ] Every case listed under Tasks Z1.2–Z1.4, Z2.1, Z3.1–Z3.3 in `plan.md`, each with its literal inputs and outputs.
- [ ] `pnpm test:unit` green; the `TZ=Asia/Kolkata` CI leg green for `libs` and `server`.
- [ ] Grep proves no process-zone API: `rg -n "getHours|getMinutes\\(|getMonth\\(|getDate\\(|getDay\\(|setHours\\(|toDateString|toLocale(Date|Time)?String|getFullYear|Intl\\.DateTimeFormat\\(undefined|new Date\\([0-9]|start \\+ binMs|\\+ timeline\\.binMs" apps libs --glob '!**/*.test.*'` returns nothing.

## E2E

- [ ] The whole suite under `timezoneId: 'America/Sao_Paulo'`: green.
- [ ] `e2e/settings.spec.ts`: changing to Asia/Kathmandu relabels the timeline and moves a tooltip range by +8 h 45 min against São Paulo.

## Prove it for real — Playwright MCP

- [x] As a user whose stored zone is America/Sao_Paulo, with the browser context in Europe/Lisbon: the timeline label reads "Times in America/Sao_Paulo"; `/settings` shows "Your browser reports Europe/Lisbon" with "Use this". — evidence: Phase A, local stack at 846b77a, Lisbon context: label "Times in America/Sao_Paulo", axis 3:30:30 PM for 18:30:30 UTC, /settings "Your browser reports Europe/Lisbon" with "Use this" (a UTC user's label read "Times in UTC"; Use this set the select to Europe/Lisbon without saving); docs/features/timezone-preference/media/timeline-label-sao-paulo-browser-lisbon.png, docs/features/timezone-preference/media/timeline-label-utc-browser-lisbon.png, docs/features/timezone-preference/media/settings-browser-lisbon-account-utc.png
- [x] Choose Asia/Kathmandu, save: toast, the documents "Updated" column and the timeline labels change without a reload. — evidence: Phase A, SPA navigation with a window marker kept alive: saved Asia/Katmandu (the only spelling the select offers, see edge cases), toast "Time zone saved", documents Updated 3:30 PM to 12:15 AM next day (+8 h 45 min), label "Times in Asia/Katmandu", axis 12:15:30 AM; docs/features/timezone-preference/media/documents-updated-sao-paulo.png, docs/features/timezone-preference/media/documents-updated-kathmandu.png, docs/features/timezone-preference/media/settings-saved-toast.png
- [ ] A document with edits spread over several days (seeded through the API with fixed `serverTime` is not possible; use the fake clock-free path: open a long-lived demo document) shows day bins starting at local midnight in the chosen zone: hover the first bin, its range starts at 12:00 AM.
- [x] A user whose stored zone is `null` (clear it through the database on the local stack) sees "(from this browser)" next to the label. — evidence: Phase A: bruno cleared with node:sqlite in the container, reload showed "Times in America/Sao_Paulo (from this browser)"; sign-out and sign-in then stored America/Sao_Paulo in auth.sqlite; docs/features/timezone-preference/media/timeline-label-from-this-browser.png, docs/features/timezone-preference/media/settings-null-zone-user.png
- [x] Narrow width 375: the settings select and buttons fit; the timeline label wraps without overflow. — evidence: Phase A: no horizontal overflow on /settings or the document page; select 327 px wide, Save 65 px, label with America/Argentina/Rio_Gallegos fits on one line; docs/features/timezone-preference/media/settings-375.png, docs/features/timezone-preference/media/timeline-label-375.png
- [x] Console and network clean; no request to `/timeline` without `timeZone`. — evidence: Phase A: zero console errors and zero 4xx/5xx across the Ana, Bruno and Caio walks; every /timeline and /summaries/selection request carried timeZone (percent-encoded); /summaries has none by design (UTC grouping)

## Edge cases found during execution

- [x] Keyboard: select a zone, Tab to Save, Enter — toast "Time zone saved" appears in a polite live region and focus stays on the Save button — evidence: Phase A, Bruno at 375 px.
- [x] A user whose stored zone is already UTC is not backfilled at sign-in (bruno stayed UTC after a fresh sign-in); only null is filled — evidence: Phase A, auth.sqlite read before and after.
- [x] A null-zone user's /settings preselects the browser zone and hides "Your browser reports" and "Use this" because they would be redundant — evidence: docs/features/timezone-preference/media/settings-null-zone-user.png.
- [ ] DEFECT (for the lead, not fixed): Chromium reports legacy names. A browser in Asia/Kathmandu reports "Asia/Katmandu"; the select lists "Asia/Katmandu", "Asia/Calcutta", "Europe/Kiev", "America/Godthab" and has no "Asia/Kathmandu"; "Use this" saves "Asia/Katmandu" and the label reads "Times in Asia/Katmandu". The test plan and the e2e spec name Asia/Kathmandu. Waiting for the canonical-names lane; re-run in Phase B.
- [ ] Observation, unverified against main: uploading `apps/web/public/blank.docx` and typing into the editor textarea showed "The editor stopped working. Reload the page to continue." Almost certainly unrelated to time zones; not investigated.

## Adversarial review

- [ ] Claim 1: bins never overlap, leave gaps or walk backwards in any zone across a DST change — attack: the plan reviewer's property suite (`tz-probe/probe.mjs`) over 2026 in Lisbon, New York, Sydney, São Paulo, Kathmandu, Kiritimati, St. John's, Chatham, Lord Howe, Santiago, Cairo and Jerusalem for every ladder size and 2/3/5-week bins; result: <refuted | held>
- [ ] Claim 2: the server never builds bins in the process zone — attack: run the suites under three `TZ` values and compare outputs; result: <refuted | held>
- [ ] Claim 3: no time on screen bypasses the formatter — attack: grep the web for `toLocale`, `Intl.DateTimeFormat(` outside the formatter, and `new Date(` rendered as text; result: <refuted | held>

## Coverage honesty

- `imported-revisions.test.ts::a listed change without an offset in its date maps to UTC` is a pin under a UTC process (it passes before the fix there); it only guards the behaviour in the `TZ=Asia/Kolkata` CI leg (core review, 2026-10-17).

- Long-span (multi-day) timelines are proven by unit and route tests with fixed `serverTime`; the live walk can only show short spans.
