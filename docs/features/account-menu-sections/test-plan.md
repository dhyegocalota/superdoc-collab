# Test plan: Account menu sections

## Unit

- [x] The admin's menu shows Account, Workspace, Help and Theme in that order and Sign out last — expected: positions ascend (evidence: account menu 12 of 12 at e864bd11)
- [x] A user's menu has no Workspace label and no Admin item (evidence: same file)
- [x] Keyboard shortcuts sits in the Help group with its hint and opens the dialog (evidence: same file)
- [x] More actions has no Keyboard shortcuts item (evidence: editor header 38 of 38 at e864bd11)

## Edge cases

- [ ] Ctrl+/ and "?" still open the dialog from the document page — expected: unchanged
