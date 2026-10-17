# Test plan: Time zone preference

Every box states the input and the exact expected outcome; ticked boxes carry ` — evidence: `.

## The failing test first

- [ ] `libs/history/src/timeline/zoned-time.test.ts` day bin in America/Sao_Paulo — input `Date.UTC(2026, 9, 17, 2, 0)`; expected `Date.UTC(2026, 9, 16, 3, 0)`; before the build: module missing, then `expected 1792195200000 to be 1792206000000` style mismatch on the epoch floor.

## Unit

- [ ] Every case listed under Tasks Z1.2–Z1.4, Z2.1, Z3.1–Z3.3 in `plan.md`, each with its literal inputs and outputs.
- [ ] `pnpm test:unit` green; the `TZ=Asia/Kolkata` CI leg green for `libs` and `server`.
- [ ] Grep proves no process-zone API: `rg -n "getHours|getDate\\(|getDay\\(|toDateString|getFullYear|new Date\\([0-9]" apps libs --glob '!**/*.test.*'` returns nothing.

## E2E

- [ ] The whole suite under `timezoneId: 'America/Sao_Paulo'`: green.
- [ ] `e2e/settings.spec.ts`: changing to Asia/Kathmandu relabels the timeline and moves a tooltip range by +8 h 45 min against São Paulo.

## Prove it for real — Playwright MCP

- [ ] As a user whose stored zone is America/Sao_Paulo, with the browser context in Europe/Lisbon: the timeline label reads "Times in America/Sao_Paulo"; `/settings` shows "Your browser reports Europe/Lisbon" with "Use this".
- [ ] Choose Asia/Kathmandu, save: toast, the documents "Updated" column and the timeline labels change without a reload.
- [ ] A document with edits spread over several days (seeded through the API with fixed `serverTime` is not possible; use the fake clock-free path: open a long-lived demo document) shows day bins starting at local midnight in the chosen zone: hover the first bin, its range starts at 12:00 AM.
- [ ] A user whose stored zone is `null` (clear it through the database on the local stack) sees "(from this browser)" next to the label.
- [ ] Narrow width 375: the settings select and buttons fit; the timeline label wraps without overflow.
- [ ] Console and network clean; no request to `/timeline` without `timeZone`.

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: bins never overlap or leave gaps in any zone across a DST change — attack: property test over a year of instants in Lisbon, New York, Sydney, Kathmandu; result: <refuted | held>
- [ ] Claim 2: the server never builds bins in the process zone — attack: run the suites under three `TZ` values and compare outputs; result: <refuted | held>
- [ ] Claim 3: no time on screen bypasses the formatter — attack: grep the web for `toLocale`, `Intl.DateTimeFormat(` outside the formatter, and `new Date(` rendered as text; result: <refuted | held>

## Coverage honesty

- Long-span (multi-day) timelines are proven by unit and route tests with fixed `serverTime`; the live walk can only show short spans.
