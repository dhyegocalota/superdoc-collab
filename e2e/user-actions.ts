import type { Locator, Page } from '@playwright/test';
import { actionsMenuLabel } from '../apps/web/src/features/admin/admin-copy';

export async function chooseUserAction({
  page,
  row,
  name,
  label,
}: {
  page: Page;
  row: Locator;
  name: string;
  label: string;
}): Promise<void> {
  await row.getByRole('button', { name: actionsMenuLabel(name) }).click();
  await page.getByRole('menuitem', { name: label }).click();
}
