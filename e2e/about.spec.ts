import {
  ABOUT_HEADING,
  ABOUT_LINK_LABEL,
  BACK_TO_DOCUMENTS_LABEL,
  REPOSITORY_LABEL,
  REPOSITORY_URL,
} from '../apps/web/src/features/about/about-copy';
import { accountMenuLabel } from '../apps/web/src/features/account/account-copy';
import { AppRoute, DEMO_USERS } from '../libs/types/src';
import { expect, signedInContext, test } from './fixtures';

const [ana] = DEMO_USERS;
const PUBLIC_ASSETS = [
  { path: '/robots.txt', contentType: 'text/plain' },
  { path: '/site.webmanifest', contentType: 'manifest' },
  { path: '/favicon.ico', contentType: 'icon' },
  { path: '/favicon.svg', contentType: 'image/svg+xml' },
  { path: '/og-image.png', contentType: 'image/png' },
];

test('about opens signed out', async ({ page }) => {
  await page.goto(AppRoute.About);
  await expect(page.getByRole('heading', { name: ABOUT_HEADING })).toBeVisible();
  await expect(page).toHaveURL(AppRoute.About);
  await expect(page.getByRole('link', { name: REPOSITORY_LABEL })).toHaveAttribute('href', REPOSITORY_URL);
});

test('about opens from the account menu', async ({ browser }) => {
  const { page } = await signedInContext({ browser, user: ana! });
  await page.getByRole('button', { name: accountMenuLabel(ana!.name) }).click();
  await page.getByRole('menuitem', { name: ABOUT_LINK_LABEL }).click();
  await expect(page).toHaveURL(AppRoute.About);
  await expect(page.getByRole('heading', { name: ABOUT_HEADING })).toBeVisible();
  await page.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL, exact: true }).click();
  await expect(page).toHaveURL(AppRoute.Documents);
});

test.describe('public assets', () => {
  PUBLIC_ASSETS.forEach(({ path, contentType }) => {
    test(`${path} is served with its content type`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain(contentType);
    });
  });
});

test('the served page carries an absolute share image URL', async ({ request, baseURL }) => {
  const html = await (await request.get(AppRoute.About)).text();
  expect(html).toContain(`<meta property="og:image" content="${baseURL}/og-image.png" />`);
});
