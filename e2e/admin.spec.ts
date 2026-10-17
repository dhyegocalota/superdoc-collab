import { AppRoute, DEMO_USERS } from '../libs/types/src';
import {
  acceptInvite,
  expect,
  expectSignedInAs,
  generateInvite,
  openedContext,
  signedInAdmin,
  signedInContext,
  test,
  uniqueEmail,
} from './fixtures';
import type { Page } from '@playwright/test';

const INVITE_INVALID_MESSAGE = 'This invite is not valid. Ask an admin for a new link.';
const ADMINS_ONLY_TOAST = 'Admins only';
const INVITES_TABLE_NAME = 'Invites';
const USERS_TABLE_NAME = 'Users';
const NEWEST_ROW_INDEX = 1;
const [ana] = DEMO_USERS;

test.describe.configure({ mode: 'serial' });

function newestInvite(page: Page) {
  return page.getByRole('table', { name: INVITES_TABLE_NAME }).getByRole('row').nth(NEWEST_ROW_INDEX);
}

test('an admin invites a user who joins; the admin link shows only on the admin side', async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  await expect(newestInvite(admin.page).getByRole('cell', { name: 'Pending' })).toBeVisible();
  const email = uniqueEmail('eve');
  const invited = await acceptInvite({ browser, url, name: 'Eve', email });
  await expectSignedInAs({ page: invited.page, name: 'Eve' });
  await expect(invited.page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await admin.page.reload();
  await expect(newestInvite(admin.page).getByRole('cell', { name: 'Accepted' })).toBeVisible();
  await expect(admin.page.getByRole('table', { name: USERS_TABLE_NAME }).getByRole('row', { name: new RegExp(email) })).toBeVisible();
});

test('an invite link cannot be used twice', async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  const first = await acceptInvite({ browser, url, name: 'One', email: uniqueEmail('one') });
  await expectSignedInAs({ page: first.page, name: 'One' });
  const again = await openedContext({ browser });
  await again.page.goto(url);
  await expect(again.page.getByText(INVITE_INVALID_MESSAGE)).toBeVisible();
});

test('a revoked invite shows the invalid message', async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  await newestInvite(admin.page).getByRole('button', { name: 'Revoke' }).click();
  await expect(newestInvite(admin.page).getByRole('cell', { name: 'Revoked' })).toBeVisible();
  const visitor = await openedContext({ browser });
  await visitor.page.goto(url);
  await expect(visitor.page.getByText(INVITE_INVALID_MESSAGE)).toBeVisible();
});

test('a user opening /admin is sent to documents with the admins-only toast', async ({ browser }) => {
  const user = await signedInContext({ browser, user: ana! });
  await user.page.goto(AppRoute.Admin);
  await expect(user.page).toHaveURL(AppRoute.Documents);
  await expect(user.page.getByText(ADMINS_ONLY_TOAST)).toBeVisible();
});
