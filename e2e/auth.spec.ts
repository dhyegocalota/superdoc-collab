import { AUTH_ERROR_MESSAGE, AppRoute, DEMO_USERS, ShareLinkRole } from '../libs/types/src';
import { editorText, readShareLinks, uploadSeed } from './editor';
import {
  DEMO_PASSWORD,
  FORWARDED_FOR_HEADER,
  expect,
  expectSignedInAs,
  randomClientAddress,
  signedInContext,
  signIn,
  test,
} from './fixtures';

const [ana, bruno] = DEMO_USERS;
const NARROW_VIEWPORT = { width: 375, height: 812 };
const FAILED_ATTEMPTS_BEFORE_LIMIT = 4;
const INVITE_INVALID_MESSAGE = 'This invite is not valid. Ask an admin for a new link.';
const SHARED_PARAGRAPH = 'Shared: the plan costs 10.';
const DOCUMENT_URL_PATTERN = /\/documents\/([^/?#]+)$/;
const EDITOR_READY_TIMEOUT_MS = 60_000;

test('sign-up without an invite is refused once the instance is claimed', async ({ page }) => {
  await page.goto(AppRoute.SignUp);
  await expect(page.getByText(INVITE_INVALID_MESSAGE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up' })).toHaveCount(0);
});

test('sign-in offers no way to create an account once the instance is claimed', async ({ page }) => {
  await page.goto(AppRoute.SignIn);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: /create account|sign up|claim this instance/i })).toHaveCount(0);
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

test('a signed-out member who opens a share link lands on the document after signing in', async ({ browser, page }) => {
  const owner = await signedInContext({ browser, user: ana! });
  const documentId = await uploadSeed({ page: owner.page, paragraphs: [SHARED_PARAGRAPH] });
  const links = await readShareLinks({ page: owner.page, documentId });
  const sharePath = new URL(links[ShareLinkRole.Edit]).pathname;
  await page.goto(sharePath);
  await expect(page).toHaveURL(`${AppRoute.SignIn}?next=${encodeURIComponent(sharePath)}`);
  await signIn({ page, email: bruno!.email, password: DEMO_PASSWORD });
  await expect(page).toHaveURL(DOCUMENT_URL_PATTERN);
  expect(DOCUMENT_URL_PATTERN.exec(page.url())![1]).toBe(documentId);
  await expect(editorText(page).filter({ hasText: SHARED_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
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
