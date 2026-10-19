import { randomUUID } from 'node:crypto';
import type { Browser, Locator, Page } from '@playwright/test';
import { ACCOUNT_ARCHIVED_MESSAGE, AppRoute, DOCUMENT_UNAVAILABLE_MESSAGE, HttpStatus } from '../libs/types/src';
import { accountMenuLabel } from '../apps/web/src/features/account/account-copy';
import {
  ADMINS_ONLY_TOAST,
  ARCHIVE_LABEL,
  ARCHIVED_CHIP_LABEL,
  IMPERSONATE_LABEL,
  RESTORE_LABEL,
} from '../apps/web/src/features/admin/admin-copy';
import { STOP_IMPERSONATING_LABEL, viewingAsLabel } from '../apps/web/src/features/impersonation/impersonation-copy';
import { uploadSeed } from './editor';
import {
  acceptInvite,
  DEMO_PASSWORD,
  expect,
  expectSignedInAs,
  generateInvite,
  signedInAdmin,
  signIn,
  test,
  uniqueEmail,
  type OpenedContext,
} from './fixtures';

const USERS_TABLE_NAME = 'Users';
const ADMIN_NAME = 'Admin';
const PARAGRAPHS = ['Paragraph written by the person who is about to be archived.'];
const ACCESS_LOST_TIMEOUT_MS = 20_000;
const DOCUMENT_URL_PATTERN = /\/documents\/[^/?#]+/;

function userRow({ page, email }: { page: Page; email: string }): Locator {
  return page.getByRole('table', { name: USERS_TABLE_NAME }).getByRole('row', { name: new RegExp(email) });
}

async function invitedWithDocument({
  browser,
  admin,
  name,
  title,
}: {
  browser: Browser;
  admin: OpenedContext;
  name: string;
  title: string;
}): Promise<{ person: OpenedContext; email: string }> {
  await admin.page.goto(AppRoute.Admin);
  const email = uniqueEmail(name.toLowerCase());
  const person = await acceptInvite({ browser, url: await generateInvite({ page: admin.page }), name, email });
  await expectSignedInAs({ page: person.page, name });
  await uploadSeed({ page: person.page, paragraphs: PARAGRAPHS, fileName: `${title}.docx` });
  await admin.page.reload();
  return { person, email };
}

test('the admin archives a person who loses the open editor and cannot sign in, then restores them', async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  const { person: bruno, email } = await invitedWithDocument({
    browser,
    admin,
    name: 'Bruno',
    title: `archive-${randomUUID().slice(0, 8)}`,
  });

  await userRow({ page: admin.page, email }).getByRole('button', { name: ARCHIVE_LABEL }).click();
  await admin.page.getByRole('alertdialog').getByRole('button', { name: ARCHIVE_LABEL }).click();
  await expect(userRow({ page: admin.page, email }).getByText(ARCHIVED_CHIP_LABEL)).toBeVisible();
  await expect(userRow({ page: admin.page, email }).getByRole('button', { name: IMPERSONATE_LABEL })).toHaveCount(0);

  await expect(bruno.page.getByText(DOCUMENT_UNAVAILABLE_MESSAGE).or(bruno.page.getByRole('button', { name: 'Sign in' }))).toBeVisible({
    timeout: ACCESS_LOST_TIMEOUT_MS,
  });

  await bruno.page.goto(AppRoute.SignIn);
  await signIn({ page: bruno.page, email, password: DEMO_PASSWORD });
  await expect(bruno.page.getByText(ACCOUNT_ARCHIVED_MESSAGE)).toBeVisible();
  await expect(bruno.page).toHaveURL(AppRoute.SignIn);

  await userRow({ page: admin.page, email }).getByRole('button', { name: RESTORE_LABEL }).click();
  await expect(userRow({ page: admin.page, email }).getByText(ARCHIVED_CHIP_LABEL)).toHaveCount(0);

  await signIn({ page: bruno.page, email, password: DEMO_PASSWORD });
  await expectSignedInAs({ page: bruno.page, name: 'Bruno' });
});

test('the admin impersonates a person, sees their documents behind the banner, and stops', async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  const title = `impersonate-${randomUUID().slice(0, 8)}`;
  const { email } = await invitedWithDocument({ browser, admin, name: 'Caio', title });

  const forbiddenResponses: string[] = [];
  admin.page.on('response', (response) => {
    if (response.status() === HttpStatus.Forbidden) forbiddenResponses.push(response.url());
  });
  await userRow({ page: admin.page, email }).getByRole('button', { name: IMPERSONATE_LABEL }).click();
  await expect(admin.page).toHaveURL(AppRoute.Documents);
  const banner = admin.page.getByTestId('impersonation-banner');
  await expect(banner.getByText(viewingAsLabel('Caio'))).toBeVisible();
  await expect(admin.page.getByRole('banner').getByRole('button', { name: accountMenuLabel('Caio') })).toBeVisible();
  await expect(admin.page.getByRole('link', { name: title })).toBeVisible();
  await expect(admin.page.getByText(ADMINS_ONLY_TOAST)).toHaveCount(0);
  expect(forbiddenResponses).toEqual([]);

  await banner.getByRole('button', { name: STOP_IMPERSONATING_LABEL }).click();
  await expect(admin.page).toHaveURL(AppRoute.Admin);
  await expect(banner).toHaveCount(0);
  await expect(admin.page.getByRole('banner').getByRole('button', { name: accountMenuLabel(ADMIN_NAME) })).toBeVisible();
  await expect(admin.page.getByRole('link', { name: title })).toHaveCount(0);
});

test('stopping from inside the impersonated editor leaves no failed request behind', async ({ browser }) => {
  const admin = await signedInAdmin({ browser });
  const title = `stop-editor-${randomUUID().slice(0, 8)}`;
  const { email } = await invitedWithDocument({ browser, admin, name: 'Caio', title });

  await userRow({ page: admin.page, email }).getByRole('button', { name: IMPERSONATE_LABEL }).click();
  await expect(admin.page).toHaveURL(AppRoute.Documents);
  await admin.page.getByRole('link', { name: title }).click();
  await expect(admin.page).toHaveURL(DOCUMENT_URL_PATTERN);
  await expect(admin.page.getByTestId('impersonation-banner')).toBeVisible();

  const failedResponses: string[] = [];
  admin.page.on('response', (response) => {
    if (response.status() >= HttpStatus.BadRequest) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await admin.page.getByTestId('impersonation-banner').getByRole('button', { name: STOP_IMPERSONATING_LABEL }).click();
  await expect(admin.page).toHaveURL(AppRoute.Admin);
  await expect(admin.page.getByTestId('impersonation-banner')).toHaveCount(0);
  await expect(admin.page.getByRole('banner').getByRole('button', { name: accountMenuLabel(ADMIN_NAME) })).toBeVisible();
  expect(failedResponses).toEqual([]);
});
