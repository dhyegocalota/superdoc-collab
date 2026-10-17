# A guard hook blocks a harmless command because the forbidden flag appears in quoted prose
- Date: 2026-10-17
- Inspired by: editing `.claude/HARNESS.md` through a shell heredoc while adding the merge-sensitivity rule; `guard-git-add-all.sh`
- Revisited: 2026-10-17 — still true

## Signal
A Bash call that only writes or prints text is refused with `Blocked: --no-verify skips the gates this repo depends on.` although it never runs git. The text being written quotes the flag, for example a harness paragraph, a learning or a test fixture.

## Cause
`guard-git-add-all.sh` matches the flag anywhere in `tool_input.command`, including inside heredocs, `printf` arguments and Python strings. That is deliberate: a hook that parses shell to find the "real" command would be larger than the rule it enforces, and the false positive costs one retry while a false negative costs a skipped gate.

## Do
Write prose that quotes a guarded flag with the `Write` or `Edit` tool, or from a script file created with them, and run the script by path. Do not weaken the hook. If a fixture must contain the flag, build it from pieces in the script (`"--no-" + "verify"`) so the hook's own tests can still exercise the real string.

## Anchor
- `.agents/hooks/guard-git-add-all.sh`
- `.agents/hooks/hooks.test.sh` (fixtures written with the `Write` tool for this reason)
- `.claude/HARNESS.md` section 12
