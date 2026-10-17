# Time zone preference — spec

- Status: Draft (owner requirement recorded 2026-10-17; audit in progress; brainstorm pending)
- Tier: red (touches storage of a user preference, every time formatter, the timeline bin alignment and the version resolution).
- Owner approval: pending.
- ADRs: pending (one for "bins and labels follow the reader's zone; storage stays epoch milliseconds").
- Not changing: storage of times (epoch milliseconds everywhere), version marks per minute.

## Owner requirement (verbatim intent, 2026-10-17)

Time zones must work extremely well and carefully, for everything. The end user must always see times that are consistent and coherent with their preferred time zone. There is a preferences page where the user picks a zone; by default it is the browser's zone.

## Problem

Every time in the product is an epoch millisecond, which is correct for storage and comparison. Display and grouping are where zones matter: labels on the chart, the version banner, the "Updated" column, invite expiry, tooltips, and the alignment of hour, day and week bins, which today floor epoch milliseconds and therefore split a reader's day at UTC midnight. The audit in `audit.md` (to be written by the researcher) lists every site.

## Goals (to be refined in brainstorming)

- A user preference `timeZone` (IANA name) stored on the user; `null` means "follow the browser", which is the default for every account.
- A preferences page (`/settings`) with a zone picker fed by `Intl.supportedValuesOf('timeZone')`, showing the detected browser zone as the default option.
- One formatter in `apps/web/src/lib/format-date-time.ts` that always receives the effective zone; no call site formats without it.
- Timeline requests carry the effective zone; bins of one hour and longer are aligned to that zone's local boundaries, including across DST transitions; the chart axis and tooltips label bins in that zone.
- Version resolution ("the document at the end of this bin") uses the same bin boundaries.
- Tests run under at least three fixed zones (UTC, America/Sao_Paulo, Europe/Lisbon around a DST switch) and pin the boundaries.

## Non-goals

- Changing how times are stored.
- Per-document or per-organisation zones.
