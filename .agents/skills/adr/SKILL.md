---
name: adr
description: Creates a numbered architecture decision record in docs/adr/. Use when a decision has alternatives, when the owner says "record this decision", "write an ADR", "we chose X over Y", or when a spec depends on a choice that has no ADR yet.
metadata:
  author: in-house
  created: 2026-10-16
---
# ADR

Process: `.claude/HARNESS.md` section 2. Record the ADR before the code that depends on it.

1. List `docs/adr/` on `main` and on every local and remote branch (`git ls-tree --name-only -r --full-tree <branch> docs/adr` for each of `git branch -a`). The next number is the highest four-digit prefix seen anywhere plus one, zero-padded to four digits. Never reuse or renumber; a gap is fine, a collision is not.
2. Get the title and slug (kebab-case). If missing, ask.
3. Copy `docs/adr/_template.md` to `docs/adr/NNNN-<slug>.md`.
4. Fill the header: `Status` (`Proposed` until the owner confirms, then `Accepted`), `Date` (today, YYYY-MM-DD), `Deciders`, `Inspired by` (POC results, benchmarks, learnings, docs).
5. Write Context, Decision, Consequences, Evidence and Revisit when.
6. The alternatives table needs at least two rows: the chosen option and at least one rejected option, each with pros, cons and why not. With fewer than two real alternatives it is not an ADR; say so and stop.
7. Add the row to the index table in `docs/adr/README.md` in number order: number, title, status and date exactly as the record states them. `document-indexes.test.ts` fails on a missing row, a row out of order or a cell that differs from the record.
8. Superseding: write a new ADR that names the old one in Context. In the old ADR change only the status line to `Superseded by [NNNN](NNNN-slug.md)` and update its row in the index. Never edit the old decision text.
9. Link the new ADR from the spec that depends on it.

If the decision is not settled with the owner, write it as `Proposed` and ask. Do not mark `Accepted` on your own.
