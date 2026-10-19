# Plan: Admin users Actions menu

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/features/admin/`

## Steps

- [ ] **Step 1:** red: the admin page unit test (one button per row, the menu lists the actions, each action through the menu) and the E2E spec opening the menu first.
- [ ] **Step 2:** green: `UserActionsMenu` replaces the role toggle, reset, archive, restore and impersonate buttons.
- [ ] **Step 3:** typecheck, changed unit files, the admin E2E spec.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | A dialog opened from the menu leaves `pointer-events: none` on the body | the E2E click after the dialog does nothing | keep the menu `modal={false}` |

**Steps with no backout:** none.
