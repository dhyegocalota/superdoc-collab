import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomInt, randomUUID } from 'node:crypto';
import { ApiPath, AppRoute, type DemoUser } from '../libs/types/src';
import { accountMenuLabel } from '../apps/web/src/features/account/account-copy';

const OCTET_LIMIT = 256;
const EMAIL_SUFFIX_LENGTH = 8;

export const FORWARDED_FOR_HEADER = 'x-forwarded-for';
export const DEMO_PASSWORD = 'superdoc-demo';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PERMISSIONS = ['clipboard-read', 'clipboard-write'];

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
  await expect(page.getByRole('banner').getByRole('button', { name: accountMenuLabel(name) })).toBeVisible();
}

function baseUrlOption(origin?: string): { baseURL?: string } {
  if (origin === undefined) return {};
  return { baseURL: origin };
}

const openedContexts: BrowserContext[] = [];

export type SignedInContext = { context: BrowserContext; page: Page; userId: string };

export async function signedInContext({
  browser,
  user,
  origin,
}: {
  browser: Browser;
  user: DemoUser;
  origin?: string;
}): Promise<SignedInContext> {
  const context = await browser.newContext({
    extraHTTPHeaders: { [FORWARDED_FOR_HEADER]: randomClientAddress() },
    ...baseUrlOption(origin),
  });
  openedContexts.push(context);
  const page = await context.newPage();
  await page.goto(AppRoute.SignIn);
  await signIn({ page, email: user.email, password: DEMO_PASSWORD });
  await expect(page).toHaveURL(AppRoute.Documents);
  const response = await page.request.get(ApiPath.Me);
  const { user: session } = (await response.json()) as { user: { id: string } };
  return { context, page, userId: session.id };
}

export type OpenedContext = { context: BrowserContext; page: Page };

export async function openedContext({
  browser,
  permissions,
  origin,
}: {
  browser: Browser;
  permissions?: string[];
  origin?: string;
}): Promise<OpenedContext> {
  const context = await browser.newContext({
    extraHTTPHeaders: { [FORWARDED_FOR_HEADER]: randomClientAddress() },
    permissions,
    ...baseUrlOption(origin),
  });
  openedContexts.push(context);
  const page = await context.newPage();
  return { context, page };
}

export async function signedInAdmin({ browser }: { browser: Browser }): Promise<OpenedContext> {
  const admin = await openedContext({ browser, permissions: ADMIN_PERMISSIONS });
  await admin.page.goto(AppRoute.SignIn);
  await signIn({ page: admin.page, email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  await expect(admin.page).toHaveURL(AppRoute.Documents);
  return admin;
}

export async function generateInvite({ page }: { page: Page }): Promise<string> {
  await page.getByRole('button', { name: 'Generate invite' }).click();
  const dialog = page.getByRole('dialog');
  const url = await dialog.getByRole('textbox', { name: 'Invite link' }).inputValue();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  return url;
}

export async function acceptInvite({
  browser,
  url,
  name,
  email,
}: {
  browser: Browser;
  url: string;
  name: string;
  email: string;
}): Promise<OpenedContext> {
  const invited = await openedContext({ browser });
  await invited.page.goto(url);
  await invited.page.getByLabel('Name').fill(name);
  await invited.page.getByLabel('Email').fill(email);
  await invited.page.getByLabel('Password').fill(DEMO_PASSWORD);
  await invited.page.getByRole('button', { name: 'Sign up' }).click();
  return invited;
}

export const test = base.extend<{ clientAddress: string; closeOpenedContexts: void }>({
  closeOpenedContexts: [
    async ({}, use) => {
      await use();
      await Promise.all(openedContexts.splice(0).map((context) => context.close()));
    },
    { auto: true },
  ],
  clientAddress: async ({}, use) => {
    await use(randomClientAddress());
  },
  extraHTTPHeaders: async ({ clientAddress }, use) => {
    await use({ [FORWARDED_FOR_HEADER]: clientAddress });
  },
});

export { expect };
