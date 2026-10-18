# The signed-in check cannot find the user's name in the top bar
- Date: 2026-10-18
- Inspired by: the E2E triage of the room-admission merge, `admin.spec.ts` and `auth.spec.ts` failing in `expectSignedInAs` after sign-in
- Revisited: 2026-10-18 — fixed in the fixture (`3ec48b1`)
- Revisited: 2026-10-18 — still true; the account button label is unchanged and its avatar takes a `colorSlot` prop

## Signal
After a successful sign-in, `getByRole('banner').getByText(name, { exact: true })` finds nothing and every spec that calls `expectSignedInAs` fails at the fixture line, while the page is on the documents list.

## Cause
The account menu renders an avatar. The name is the accessible label of the trigger button and appears as text only inside the menu once it is open, so no text node in the banner holds it.

## Do
Look for the button by its label: `getByRole('banner').getByRole('button', { name: accountMenuLabel(name) })`. Never assert visible text for something the design shows as an avatar.

## Anchor
- `e2e/fixtures.ts` (`expectSignedInAs`), commit `3ec48b1`
- `apps/web/src/features/account/account-menu.tsx`, `account-copy.ts` (`accountMenuLabel`)
