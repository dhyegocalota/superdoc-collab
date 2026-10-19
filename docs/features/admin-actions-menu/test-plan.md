# Test plan: Admin users Actions menu

## Unit

- [x] Every user row has exactly one button, named "Actions for <name>" — expected: no other button in the row
- [x] The menu of another active user lists Make admin, Reset password, Impersonate and Archive; of the signed-in admin only Reset password; of an archived user Make admin, Reset password and Restore
- [x] Archive from the menu asks first, naming the person — expected: no request before the confirmation, one POST after it
- [x] Each other action through the menu posts as before — expected: role, reset link dialog, restore, impersonate

## E2E

- [x] Archive, restore and impersonate cases open the menu before clicking — expected: unchanged outcomes

## Edge cases

- [x] Escape closes the menu and returns focus to the trigger — expected: focus on "Actions for <name>"

## Playwright MCP walk (tester run 2026-10-19, shared scenario stack, lane/testing2 at 2aef190c)

Screenshots under `.pr-media/admin-actions-menu/walk/`.

- [x] One Actions button per row at 1280 — evidence: the five rows each hold exactly one button, "Actions for Admin", "Ana", "Bruno", "Caio", "Dani"; users-1280.png
- [x] 375 px: no sideways page scroll — evidence: document scrollWidth 375 of 375, shell scroller 360 of 360 (the vertical scrollbar); users-375.png
- [ ] 375 px: the Actions button is reachable without scrolling the table — FAILED: the table scrolls inside its own wrapper (501 of 310 px) and the Actions column sits right of the viewport (trigger left 468, right 504, viewport 375) until the wrapper is scrolled sideways; after scrollIntoView the trigger is at 277 to 313. The page itself never scrolls. Repro: sign in as admin, open /admin at 375 px wide, look for the Actions button without touching the table. users-375.png
- [x] The open menu stays inside the viewport at 375 — evidence: menu left 181, right 313, top 472, bottom 619 in a 375 by 812 viewport, document scrollWidth 375; actions-menu-open-375.png
- [x] Menu order for another active user — evidence: Make admin, Reset password, Impersonate, separator, Archive; actions-menu-open-375.png, keyboard-menu-open-1280.png
- [x] Menu for an admin row and the signed-in admin, and for an archived user — evidence: Caio as admin: Make user, Reset password, separator, Archive (no Impersonate); the signed-in Admin: Reset password only; archived Dani: Make admin, Reset password, Restore (no separator, no Impersonate); archived-row-menu-1280.png
- [x] Keyboard: Tab to the trigger, Enter opens, ArrowDown moves, Escape closes with focus on the trigger — evidence: Tab from Admin's trigger lands on "Actions for Ana", the next Tab on Bruno's, so one stop per row; Enter opened the menu with focus on Make admin; ArrowDown moved to Reset password, Impersonate, Archive and stays on Archive; ArrowUp moved back to Impersonate; Escape closed the menu and focus was on "Actions for Ana"; keyboard-menu-open-1280.png
- [x] Archive, confirm, Cancel returns focus to the trigger — evidence: the alert dialog "Archive Dani?" opened with focus on Cancel; Cancel closed it and focus was on "Actions for Dani", no request sent; Escape inside the dialog also returned focus to the trigger; archive-confirm-1280.png
- [x] Reset password, link dialog, close returns focus — evidence: dialog "Password reset link" with Copy link and Close; Close returned focus to "Actions for Dani"; reset-password-link-1280.png
- [x] Impersonate from the menu shows the banner and Stop returns to Admin — evidence: banner "Viewing as Bruno" with the account menu reading "Account, Bruno", at 1280 and at 375 (scrollWidth 375 of 375); Stop impersonating went to /admin as Admin with no banner; console errors 0; impersonate-from-menu-1280.png, impersonate-from-menu-375.png, stopped-375.png
- [x] Restore from the menu — evidence: Dani archived then restored through the menu, the row reads User with no chip; users-1280-after-restore.png
- [x] Items disabled while an action is pending — evidence: with the role request delayed 4 s, the trigger stays enabled and opens the menu, and every item reads aria-disabled true and data-disabled until the request settles (Caio became Admin, the trigger works again); pending-1280.png, pending-menu-open-1280.png
