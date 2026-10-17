# Keystroke-level events must be grouped into runs before any term search

- Date: 2026-10-16
- Inspired by: slice 3 Task 3 (`libs/history/src/timeline/runs.ts`); slice 2 read model stores one event per Yjs update
- Revisited: 2026-10-16 — deletions matched in Backspace order

## Signal
Searching the edit events for "Budget" finds nothing although someone typed it: the read model holds `b`, `u`, `d`, `g`, `e`, `t` as six events, and a backspaced word arrives as `tegdub`.

## Cause
Hocuspocus stores each update; the projection keeps the insert/delete text per update, so a word never exists in one event.

## Do
Group consecutive events by author, block and bin into runs (concatenate inserts, reverse deletes) and match terms against the runs; expose runs, not events, to the timeline and the panel.

## Anchor
`libs/history/src/timeline/runs.ts`, `runs.test.ts`
