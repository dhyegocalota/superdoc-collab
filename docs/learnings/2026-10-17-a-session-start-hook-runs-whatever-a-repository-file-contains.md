# A session-start hook runs whatever a repository file contains when bash compares it with -ge

- Date: 2026-10-17
- Inspired by: the security review of the `agent-doctor` branch ([ADR 0026](../adr/0026-the-agent-repairs-its-own-machine-doctor-reports-never-installs.md)), which reproduced the execution with a one-line `.nvmrc`
- Revisited: 2026-10-17 — recorded

## Signal

A file appears on the machine, or a command runs, the moment Claude Code or Codex opens the repository, before anyone typed a prompt; nothing in `git diff` touches a `.sh`, only a data file such as `.nvmrc` or `package.json` changed, and the hook's exit code is 0 because the wiring ends in `|| true`.

## Cause

Bash evaluates both operands of `[[ a -ge b ]]`, `-eq`, `-lt` and of `$(( ))` as arithmetic expressions, and arithmetic expansion runs command substitutions inside array subscripts: `root[$(touch /tmp/x)]` creates the file. `.agents/hooks/doctor.sh` read `.nvmrc` with `tr -d '[:space:]'` and compared it with the machine's Node major; any line that was not a version passed through unchanged. A session-start hook makes that reachable from a single committed line in a data file, on every machine that checks the branch out, and CI never sees it because `actions/setup-node` rejects the invalid `.nvmrc` first.

## Do

Anything a hook reads from the repository is untrusted input. Validate the shape before the first use (`[[ "$value" =~ ^[0-9]+$ ]]`, `pnpm@[0-9]+\.[0-9]+\.[0-9]+`) and exit with a one-line reason otherwise; never put an unvalidated string on either side of an arithmetic comparison, inside `$(( ))` or in an array subscript. Give the hook a test seam for the file it reads (`DOCTOR_NVMRC`) and pin the hostile case in `hooks.test.sh`: the exit code, the message and the absence of the side effect. Treat every new hook as an attack surface in the security review, not only product code.

## Anchor

- `.agents/hooks/doctor.sh` → `wanted_node`, `wanted_pnpm`, `node_major`, `check_node`
- `.agents/hooks/hooks.test.sh` → `doctor: a hostile .nvmrc exits 1 and runs nothing`
- commit `1e6a49c` (the fix); the vulnerable version is `d10c064`
