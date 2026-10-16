import { expect, test as base, type Page } from '@playwright/test';
import { randomInt, randomUUID } from 'node:crypto';
import { AppRoute } from '../libs/types/src';

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

export const test = base.extend<{ clientAddress: string }>({
  clientAddress: async ({}, use) => {
    await use(randomClientAddress());
  },
  extraHTTPHeaders: async ({ clientAddress }, use) => {
    await use({ [FORWARDED_FOR_HEADER]: clientAddress });
  },
});

export { expect };
