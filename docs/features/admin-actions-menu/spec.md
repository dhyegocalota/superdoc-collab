# Admin users: one Actions menu per row

**Status:** Shipped 2026-10-19
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner's requirement 30, translated: "replace the several buttons per row in Admin → Users with one icon-only Actions button that opens a dropdown")
**ADRs:** none
**Not changing:** which actions exist, their labels, the archive confirm dialog, the password reset link dialog, the server routes

## Problem

Each row of Admin → Users shows up to five buttons side by side, which wraps and crowds the table at narrow widths.

## Design

- One icon-only ghost button per row with the ellipsis icon of the editor header's More actions menu and `aria-label` "Actions for <name>". It opens the shared dropdown menu.
- The menu lists the row's current actions with their current labels: Make admin or Make user (other users), Reset password, Restore (archived users), Impersonate (active non-admin users), then a separator and Archive in the destructive variant (other active users).
- Items are disabled while an action of that row is pending. Archive still asks first in its confirm dialog; Reset password still opens the link dialog; both return focus to the trigger. The menu is non-modal so the dialogs do not leave `pointer-events: none` on the body.
- A failed action shows the existing action-failed message next to the trigger.
- Copy lives in `admin-copy.ts`. Keyboard: Enter and Space open, arrows move, Escape closes (the Radix menu).

## Test strategy summary

Unit: each row has exactly one button, the menu lists the actions per row kind, each action posts as before, Archive keeps its confirm dialog. E2E: the archive and impersonate cases open the menu before clicking the action.
