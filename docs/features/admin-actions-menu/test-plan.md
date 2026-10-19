# Test plan: Admin users Actions menu

## Unit

- [x] Every user row has exactly one button, named "Actions for <name>" — expected: no other button in the row (evidence: unit 22 of 22 at b339abbf; now 24 of 24 after the follow-up)
- [x] The menu of another active user lists Make admin, Reset password, Impersonate and Archive; of the signed-in admin only Reset password; of an archived user Make admin, Reset password and Restore (evidence: unit, same run)
- [x] Archive from the menu asks first, naming the person — expected: no request before the confirmation, one POST after it (evidence: unit, same run)
- [x] Each other action through the menu posts as before — expected: role, reset link dialog, restore, impersonate (evidence: unit, same run)

## E2E

- [x] Archive, restore and impersonate cases open the menu before clicking — expected: unchanged outcomes (evidence: archive E2E 3 of 3 at b339abbf, reset E2E 1 of 1)

## Edge cases

- [x] Escape closes the menu and returns focus to the trigger — expected: focus on "Actions for <name>" (evidence: unit, focus returns to the trigger after Archive cancel and after the reset dialog closes)
