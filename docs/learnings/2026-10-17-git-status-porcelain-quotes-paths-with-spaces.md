# A hook that parses `git status --porcelain` maps a path with a space to the wrong folder

- Date: 2026-10-17
- Inspired by: the `package-readmes` review and tester run: `remind-docs.sh` named the root `README.md` for `apps/web/src/b c.ts` instead of `apps/web/README.md`
- Revisited: 2026-10-17

## Signal
A script that reads changed files from `git status --porcelain` works for every path except those with a space (or a literal ` -> `): the path keeps a leading `"`, never matches a folder or glob, and a staged rename reports only its new side.

## Cause
`--porcelain` wraps any path containing a space in double quotes, and `core.quotePath=false` only stops the octal escaping of non-ASCII bytes, not that quoting. A rename is one `R  old -> new` line, so stripping the prefix and splitting on ` -> ` loses the old path and breaks on file names that contain the arrow.

## Do
List changed paths with `git -c core.quotePath=false diff --name-only --no-renames HEAD` plus `git -c core.quotePath=false ls-files --others --exclude-standard`: both print paths unquoted, one per line, and `--no-renames` lists both sides of a rename. Reach for `--porcelain -z` only when the status letters are needed.

## Anchor
`.agents/hooks/remind-docs.sh`, `.agents/hooks/hooks.test.sh` ("a path with spaces names its folder's README", "a rename names the README of the folder the file left"), commits 0f4ac9b and d674cf2
