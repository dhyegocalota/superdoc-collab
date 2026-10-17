# Test plan: Time zone preference

Every box states the input and the exact expected outcome; ticked boxes carry ` — evidence: `.

## The failing test first

- [ ] `libs/history/src/timeline/zoned-time.test.ts` day bin in America/Sao_Paulo — input `Date.UTC(2026, 9, 17, 2, 0)`; expected `Date.UTC(2026, 9, 16, 3, 0)`; before the build: module missing, then the epoch floor `1792195200000` where `1792119600000` is expected.

## Unit

- [ ] Every case listed under Tasks Z1.2–Z1.4, Z2.1, Z3.1–Z3.3 in `plan.md`, each with its literal inputs and outputs.
- [x] `pnpm test:unit` green; the `TZ=Asia/Kolkata` CI leg green for `libs` and `server`. — evidence: Phase B at 8e31cca: typecheck clean; libs/types 42, libs/history 314, apps/web 377, apps/server 530 passed with 2 skipped, hooks green (log scratchpad/tz-b-unit.log); TZ=Asia/Kolkata for history and server: 314 and 530 passed, 2 skipped (scratchpad/tz-b-kolkata.log); the 150 ms latency test did not fail in this run
- [x] Grep proves no process-zone API: `rg -n "getHours|getMinutes\\(|getMonth\\(|getDate\\(|getDay\\(|setHours\\(|toDateString|toLocale(Date|Time)?String|getFullYear|Intl\\.DateTimeFormat\\(undefined|new Date\\([0-9]|start \\+ binMs|\\+ timeline\\.binMs" apps libs --glob '!**/*.test.*' --glob '!libs/history/src/timeline/zoned-time.ts'` returns nothing. `zoned-time.ts` is exempt: it is the one module that does wall-clock arithmetic, with `setUTC*` on a `new Date(0)` and `start + binMs` only as a candidate before the zone floor. — evidence: lead, at 8e31cca, 0 hits outside the exempt module; the tester's Phase B found the 3 exempt hits and read them as zone-correct.

## E2E

- [x] The whole suite under `timezoneId: 'America/Sao_Paulo'`: green. — evidence: Phase B at 8e31cca: 46 passed in 2.6 min on ports 3300 and 3399 (3100 and 3199 were held by another lane; the port edits were reverted, nothing committed), scratchpad/tz-b-e2e.log
- [x] `e2e/settings.spec.ts`: saving America/Sao_Paulo then Asia/Tokyo relabels the timeline and moves a tooltip time by exactly +12 h. — evidence: Phase B: passes (settings.spec.ts:45, 16.1 s). NB the spec compares Asia/Tokyo with São Paulo (+12 h), not Kathmandu +8 h 45 min as this box says; the box text is stale

## Prove it for real — Playwright MCP

- [x] As a user whose stored zone is America/Sao_Paulo, with the browser context in Europe/Lisbon: the timeline label reads "Times in America/Sao_Paulo"; `/settings` shows "Your browser reports Europe/Lisbon" with "Use this". — evidence: Phase A, local stack at 846b77a, Lisbon context: label "Times in America/Sao_Paulo", axis 3:30:30 PM for 18:30:30 UTC, /settings "Your browser reports Europe/Lisbon" with "Use this" (a UTC user's label read "Times in UTC"; Use this set the select to Europe/Lisbon without saving); docs/features/timezone-preference/media/timeline-label-sao-paulo-browser-lisbon.png, docs/features/timezone-preference/media/timeline-label-utc-browser-lisbon.png, docs/features/timezone-preference/media/settings-browser-lisbon-account-utc.png
- [x] Choose Asia/Kathmandu, save: toast, the documents "Updated" column and the timeline labels change without a reload. — evidence: Phase A, SPA navigation with a window marker kept alive: saved Asia/Katmandu (the only spelling the select offers, see edge cases), toast "Time zone saved", documents Updated 3:30 PM to 12:15 AM next day (+8 h 45 min), label "Times in Asia/Katmandu", axis 12:15:30 AM; docs/features/timezone-preference/media/documents-updated-sao-paulo.png, docs/features/timezone-preference/media/documents-updated-kathmandu.png, docs/features/timezone-preference/media/settings-saved-toast.png
- [x] A document with edits spread over several days (seeded through the API with fixed `serverTime` is not possible; use the fake clock-free path: open a long-lived demo document) shows day bins starting at local midnight in the chosen zone: hover the first bin, its range starts at 12:00 AM. — evidence: Phase B live API: GET /api/documents/b5dcdddc-27f6-43be-abc7-f4c3d3d8c9bb/timeline?timeZone=America/Sao_Paulo&binMs=86400000 gives three bins starting 1792119600000, 1792206000000, 1792292400000 = 2026-10-16, 17, 18 at 00:00 local (03:00Z), each 86400000 ms wide; Asia/Katmandu starts are 18:15Z = 00:00 +05:45. A live multi-day document is not possible, so the 12:00 AM tooltip hover is not walked
- [x] A user whose stored zone is `null` (clear it through the database on the local stack) sees "(from this browser)" next to the label. — evidence: Phase A: bruno cleared with node:sqlite in the container, reload showed "Times in America/Sao_Paulo (from this browser)"; sign-out and sign-in then stored America/Sao_Paulo in auth.sqlite; docs/features/timezone-preference/media/timeline-label-from-this-browser.png, docs/features/timezone-preference/media/settings-null-zone-user.png
- [x] Narrow width 375: the settings select and buttons fit; the timeline label wraps without overflow. — evidence: Phase A: no horizontal overflow on /settings or the document page; select 327 px wide, Save 65 px, label with America/Argentina/Rio_Gallegos fits on one line; docs/features/timezone-preference/media/settings-375.png, docs/features/timezone-preference/media/timeline-label-375.png
- [x] Console and network clean; no request to `/timeline` without `timeZone`. — evidence: Phase A: zero console errors and zero 4xx/5xx across the Ana, Bruno and Caio walks; every /timeline and /summaries/selection request carried timeZone (percent-encoded); /summaries has none by design (UTC grouping)

## Edge cases found during execution

- [x] Keyboard: select a zone, Tab to Save, Enter — toast "Time zone saved" appears in a polite live region and focus stays on the Save button — evidence: Phase A, Bruno at 375 px.
- [x] A user whose stored zone is already UTC is not backfilled at sign-in (bruno stayed UTC after a fresh sign-in); only null is filled — evidence: Phase A, auth.sqlite read before and after.
- [x] A null-zone user's /settings preselects the browser zone and hides "Your browser reports" and "Use this" because they would be redundant — evidence: docs/features/timezone-preference/media/settings-null-zone-user.png.
- [ ] DEFECT (for the lead, not fixed): Chromium reports legacy names. A browser in Asia/Kathmandu reports "Asia/Katmandu"; the select lists "Asia/Katmandu", "Asia/Calcutta", "Europe/Kiev", "America/Godthab" and has no "Asia/Kathmandu"; "Use this" saves "Asia/Katmandu" and the label reads "Times in Asia/Katmandu". The test plan and the e2e spec name Asia/Kathmandu. Waiting for the canonical-names lane; re-run in Phase B.
- [ ] Observation, unverified against main: uploading `apps/web/public/blank.docx` and typing into the editor textarea showed "The editor stopped working. Reload the page to continue." Almost certainly unrelated to time zones; not investigated.

- [x] Canonical spelling: `timeZone=america/sao_paulo` and `AMERICA/SAO_PAULO` return a body byte-identical to `America/Sao_Paulo`, echoing `"timeZone":"America/Sao_Paulo"`; `asia/kathmandu` answers 200 echoing `Asia/Katmandu`; `/timeline/edits` with the lowercase zone and a binStart is 200 — evidence: Phase B live API on 8e31cca.
- [x] 400s: missing timeZone, `Mars/Base`, `+03:00`, `UTC+3` and empty timeZone all answer 400 "The timeline query is invalid", on `/timeline` and `/timeline/edits`; binMs 1, 1000 and 12345 answer 400; 2, 3, 5, 52 and 520 weeks answer 200 — evidence: Phase B live API.
- [ ] BLOCKED (live): oversized binMs over the span answering 400 needs a long-span document; covered by `apps/server/src/history/timeline-routes.test.ts` "a bin size that would cover too many bins for the span answers 400", green in the Phase B unit run.

## Adversarial review

- [ ] Claim 1: bins never overlap, leave gaps or walk backwards in any zone across a DST change — attack: the plan reviewer's property suite (`tz-probe/probe.mjs`) over 2026 in Lisbon, New York, Sydney, São Paulo, Kathmandu, Kiritimati, St. John's, Chatham, Lord Howe, Santiago, Cairo and Jerusalem for every ladder size and 2/3/5-week bins; result: <refuted | held>
- [ ] Claim 2: the server never builds bins in the process zone — attack: run the suites under three `TZ` values and compare outputs; result: <refuted | held>
- [ ] Claim 3: no time on screen bypasses the formatter — attack: grep the web for `toLocale`, `Intl.DateTimeFormat(` outside the formatter, and `new Date(` rendered as text; result: <refuted | held>

## Coverage honesty

- `imported-revisions.test.ts::a listed change without an offset in its date maps to UTC` is a pin under a UTC process (it passes before the fix there); it only guards the behaviour in the `TZ=Asia/Kolkata` CI leg (core review, 2026-10-17).

- Long-span (multi-day) timelines are proven by unit and route tests with fixed `serverTime`; the live walk can only show short spans.
