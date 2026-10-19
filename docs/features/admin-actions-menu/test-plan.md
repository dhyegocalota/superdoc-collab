# Test plan: Admin users Actions menu

## Unit

- [ ] Every user row has exactly one button, named "Actions for <name>" — expected: no other button in the row
- [ ] The menu of another active user lists Make admin, Reset password, Impersonate and Archive; of the signed-in admin only Reset password; of an archived user Make admin, Reset password and Restore
- [ ] Archive from the menu asks first, naming the person — expected: no request before the confirmation, one POST after it
- [ ] Each other action through the menu posts as before — expected: role, reset link dialog, restore, impersonate

## E2E

- [ ] Archive, restore and impersonate cases open the menu before clicking — expected: unchanged outcomes

## Edge cases

- [ ] Escape closes the menu and returns focus to the trigger — expected: focus on "Actions for <name>"
