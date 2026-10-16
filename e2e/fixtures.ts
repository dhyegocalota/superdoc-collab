import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomInt, randomUUID } from 'node:crypto';
import { ApiPath, AppRoute, type DemoUser } from '../libs/types/src';

const OCTET_LIMIT = 256;
const EMAIL_SUFFIX_LENGTH = 8;

export const FORWARDED_FOR_HEADER = 'x-forwarded-for';
export const DEMO_PASSWORD = 'superdoc-demo';

export function randomClientAddress(): string {
  return `10.${randomInt(OCTET_LIMIT)}.${randomInt(OCTET_LIMIT)}.${randomInt(OCTET_LIMIT)}`;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, EMAIL_SUFFIX_LENGTH)}@example.com`;
}

export async function signIn({ page, email, password }: { page: Page; email: string; password: string }): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function expectSignedInAs({ page, name }: { page: Page; name: string }): Promise<void> {
  await expect(page).toHaveURL(AppRoute.Documents);
  await expect(page.getByText('No documents yet')).toBeVisible();
  await expect(page.getByRole('banner').getByText(name, { exact: true })).toBeVisible();
}

export type SignedInContext = { context: BrowserContext; page: Page; userId: string };

export async function signedInContext({ browser, user }: { browser: Browser; user: DemoUser }): Promise<SignedInContext> {
  const context = await browser.newContext({ extraHTTPHeaders: { [FORWARDED_FOR_HEADER]: randomClientAddress() } });
  const page = await context.newPage();
  await page.goto(AppRoute.SignIn);
  await signIn({ page, email: user.email, password: DEMO_PASSWORD });
  await expect(page).toHaveURL(AppRoute.Documents);
  const response = await page.request.get(ApiPath.Me);
  const { user: session } = (await response.json()) as { user: { id: string } };
  return { context, page, userId: session.id };
}

export const test = base.extend<{ clientAddress: string }>({
  clientAddress: async ({}, use) => {
    await use(randomClientAddress());
  },
  extraHTTPHeaders: async ({ clientAddress }, use) => {
    await use({ [FORWARDED_FOR_HEADER]: clientAddress });
  },
});

export { expect };
