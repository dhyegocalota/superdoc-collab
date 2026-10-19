# Plan: Account menu sections

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/features/account/` and `apps/web/src/features/editor/editor-header.tsx`

## Steps

- [ ] **Step 1:** red: the account menu and editor header unit tests.
- [ ] **Step 2:** green: grouped account menu, shortcuts item removed from More actions.
- [ ] **Step 3:** typecheck, changed unit files, screenshots at 1280 and 375.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | Dropping the item leaves the dialog unreachable on a touch device | the account menu test for Keyboard shortcuts fails | restore the item |

**Steps with no backout:** none.
