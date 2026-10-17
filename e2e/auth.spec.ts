import { CONNECTED_APPS_HEADING } from '../apps/web/src/features/connected-apps/connected-apps-copy';
import { MINE_EMPTY_MESSAGE } from '../apps/web/src/features/documents/documents-copy';
import { AUTH_ERROR_MESSAGE, AppRoute, DEMO_USERS } from '../libs/types/src';
import { DEMO_PASSWORD, FORWARDED_FOR_HEADER, expect, expectSignedInAs, randomClientAddress, signIn, test, uniqueEmail } from './fixtures';

const [ana, bruno] = DEMO_USERS;
const NARROW_VIEWPORT = { width: 375, height: 812 };
const FAILED_ATTEMPTS_BEFORE_LIMIT = 4;

test('a new user signs up and lands on documents', async ({ page }) => {
  const name = 'Eva Souza';
  await page.goto(AppRoute.SignUp);
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(uniqueEmail('eva'));
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expectSignedInAs({ page, name });
  await expect(page.getByText(MINE_EMPTY_MESSAGE)).toBeVisible();
});

test('wrong password shows one generic message', async ({ page }) => {
  await page.goto(AppRoute.SignIn);
  await signIn({ page, email: ana!.email, password: 'not-the-password' });
  await expect(page.getByRole('alert')).toHaveText(AUTH_ERROR_MESSAGE);
  await expect(page.getByText('user not found', { exact: false })).toHaveCount(0);
});

test('visiting documents signed out redirects to sign-in and returns after login', async ({ page }) => {
  await page.goto(AppRoute.Documents);
  await expect(page).toHaveURL(`${AppRoute.SignIn}?next=${encodeURIComponent(AppRoute.Documents)}`);
  await signIn({ page, email: ana!.email, password: DEMO_PASSWORD });
  await expectSignedInAs({ page, name: ana!.name });
});

test('visiting connected apps signed out returns to connected apps after login', async ({ page }) => {
  await page.goto(AppRoute.ConnectedApps);
  await expect(page).toHaveURL(`${AppRoute.SignIn}?next=${encodeURIComponent(AppRoute.ConnectedApps)}`);
  await signIn({ page, email: ana!.email, password: DEMO_PASSWORD });
  await expect(page).toHaveURL(AppRoute.ConnectedApps);
  await expect(page.getByRole('heading', { name: CONNECTED_APPS_HEADING })).toBeVisible();
});

test('sign out returns to sign-in and documents is protected again', async ({ page }) => {
  await page.goto(AppRoute.SignIn);
  await signIn({ page, email: bruno!.email, password: DEMO_PASSWORD });
  await expectSignedInAs({ page, name: bruno!.name });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(AppRoute.SignIn);
  await page.goto(AppRoute.Documents);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
});

test('two users in two contexts see their own names', async ({ browser }) => {
  const anaContext = await browser.newContext({ extraHTTPHeaders: { [FORWARDED_FOR_HEADER]: randomClientAddress() } });
  const brunoContext = await browser.newContext({ extraHTTPHeaders: { [FORWARDED_FOR_HEADER]: randomClientAddress() } });
  const anaPage = await anaContext.newPage();
  const brunoPage = await brunoContext.newPage();
  await anaPage.goto(AppRoute.SignIn);
  await brunoPage.goto(AppRoute.SignIn);
  await signIn({ page: anaPage, email: ana!.email, password: DEMO_PASSWORD });
  await signIn({ page: brunoPage, email: bruno!.email, password: DEMO_PASSWORD });
  await expectSignedInAs({ page: anaPage, name: ana!.name });
  await expectSignedInAs({ page: brunoPage, name: bruno!.name });
  await anaContext.close();
  await brunoContext.close();
});

test('the fourth failed attempt shows the retry message', async ({ page }) => {
  await page.goto(AppRoute.SignIn);
  const attempts = Array.from({ length: FAILED_ATTEMPTS_BEFORE_LIMIT }, (_, index) => index);
  for (const attempt of attempts) {
    await signIn({ page, email: ana!.email, password: `wrong-password-${attempt}` });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  }
  await expect(page.getByRole('alert')).toHaveText(/^Too many attempts\. Try again in \d+ seconds\.$/);
});

test('narrow viewport keeps the form usable', async ({ page }) => {
  await page.setViewportSize(NARROW_VIEWPORT);
  await page.goto(AppRoute.SignIn);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(NARROW_VIEWPORT.width);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeInViewport();
});
