## Summary

<!-- Two to four sentences: what changed and why. Link the feature folder: docs/features/<slug>/ -->

## Decisions

<!-- ADRs this change depends on or introduces: docs/adr/NNNN-<slug>.md -->

## Video

<!-- Playable: paste the .mp4 asset URL on its own line. Fallback: ![walkthrough](<gif asset url>) -->

## Screenshots

| Scene | Scene |
|---|---|
| ![caption](url) | ![caption](url) |

## Test plan

<!-- Link docs/features/<slug>/test-plan.md and paste the ticked summary: boxes / total, edge cases found, defects fixed. -->

## Review

<!-- Reviewer verdict and the findings that were fixed. -->

## Security

<!-- Security reviewer verdict, verbatim: CLEAR | FINDINGS | NOT APPLICABLE — reason, and the findings that were fixed. -->

## Learnings

<!-- docs/learnings/ files recorded or revisited by this change, or "nothing learned". -->

## Not changing

<!-- What a reader might expect here and deliberately is not. -->

## Merge sensitivity

<!-- Reviewer verdict, verbatim: LOW | MEDIUM | HIGH — reason. LOW → delete the Blast radius and Human checklist sections. -->

## Blast radius

<!-- MEDIUM or HIGH only. What this PR can break and for whom: surfaces touched (auth, sessions, sharing, history log, projection, migrations, deploy, data), who notices first, how to roll back, whether rollback loses data. -->

## Checklist

- [ ] Spec approved by the owner before building
- [ ] plan.md and test-plan.md exist and the test plan was executed by a tester sub-agent
- [ ] Reviewed by a reviewer sub-agent before opening
- [ ] Reviewed by a security-reviewer sub-agent before opening
- [ ] Screenshots and video recorded with Playwright MCP and hosted on the `pr-media-<slug>` release
- [ ] Tests: unit, E2E, and the user walk
- [ ] Everything in English; no comments, no `?? default`, no `else`

## Human checklist

<!-- MEDIUM or HIGH only; always the last section. Hand checks a person runs before merging, one box each, concrete: open X as Y and expect Z; run the rollback once; confirm the migration on a copy of production data. The agent writes these and never ticks them. -->

- [ ] 
