# Architecture docs review

**Lane:** docs
**Status:** Building
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner's request, translated: "review the architecture docs and update them if needed")
**Not changing:** ADRs (new facts get new ADRs, never edits), the README's run block

## Change

Review `docs/architecture.md` against the code and the features shipped since its last edit: revoke access, the password reset link, the About page and metadata, caret on open, the version-after-delete fix, the showcase document, the PDF print rule. For each section (brief, features, Summarize, language model, tests, deploy, limits) confirm every claim against the code with a path, fix what is wrong, add what is missing in the section's own voice, and remove nothing that is still true. Link `docs/why-no-comments.md` from the place that describes conventions. Also review `docs/install.md`, `docs/credits.md` and each package `README.md` for statements the changes made wrong.

## Test list

- `pnpm verify` class `docs`; the repository-shape tests that pin README and install blocks stay green.
