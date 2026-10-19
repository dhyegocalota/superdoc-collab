import { AppRoute, SHOWCASE_TITLE } from '../libs/types/src';
import { ShowcaseAuthor } from '../libs/history/src';
import { SHOWCASE_BUTTON_LABEL, SHOWCASE_CREATED_TOAST } from '../apps/web/src/features/admin/admin-copy';
import { documentIdOf } from './editor';
import { expect, signedInAdmin, test } from './fixtures';
import { chartSvg, expandPanel, readTimeline, VERSION_TIMEOUT_MS } from './timeline';

const DIVIDER_SELECTOR = 'line[stroke-dasharray]';
const SHOWCASE_IMPORT_TIMEOUT_MS = 180_000;
const SHOWCASE_TEST_TIMEOUT_MS = 240_000;
const CONTRIBUTORS = Object.values(ShowcaseAuthor).sort();

test('the admin creates the guided tour and its timeline shows four contributors and a marked gap', async ({ browser }) => {
  test.setTimeout(SHOWCASE_TEST_TIMEOUT_MS);
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  await admin.page.getByRole('button', { name: SHOWCASE_BUTTON_LABEL }).click();
  await expect(admin.page.getByText(SHOWCASE_CREATED_TOAST)).toBeVisible();
  await admin.page.goto(AppRoute.Documents);
  await admin.page.getByRole('link', { name: SHOWCASE_TITLE }).first().click();
  const documentId = documentIdOf(admin.page.url());
  await expect
    .poll(
      async () =>
        Object.values((await readTimeline({ page: admin.page, documentId })).authors)
          .map((author) => author.name)
          .sort(),
      {
        timeout: SHOWCASE_IMPORT_TIMEOUT_MS,
      },
    )
    .toEqual(CONTRIBUTORS);
  await expandPanel(admin.page);
  await expect.poll(() => chartSvg(admin.page).locator(DIVIDER_SELECTOR).count(), { timeout: VERSION_TIMEOUT_MS }).toBeGreaterThan(0);
});
