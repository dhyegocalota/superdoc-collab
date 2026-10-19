import type { Page } from '@playwright/test';
import { AppRoute, DEMO_USERS, MEMBERS_REFRESH_MS, RECOVERED_NOTICE_MS, SECOND_MS } from '../libs/types/src';
import {
  CANCEL_TITLE_LABEL,
  DOWNLOAD_BUTTON_LABEL,
  EXIT_CONFIRMATION_TITLE,
  LEAVE_LABEL,
  STAY_LABEL,
  TITLE_LABEL,
} from '../apps/web/src/features/editor/editor-copy';
import { brandLink, insertInParagraph, readEditorText, signOut, titleButton, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import {
  ensureServerRunning,
  RestartablePort,
  startRestartableStack,
  startServer,
  stopRestartableStack,
  stopServer,
} from './restartable-stack';

const [ana] = DEMO_USERS;
const PROVIDER_RETRY_CAP_MS = 30 * SECOND_MS;
const LOST_TIMEOUT_MS = PROVIDER_RETRY_CAP_MS;
const RECOVERY_TIMEOUT_MS = PROVIDER_RETRY_CAP_MS + MEMBERS_REFRESH_MS + RECOVERED_NOTICE_MS + 10 * SECOND_MS;
const BANNER_TEST_ID = 'connection-banner';
const PARAGRAPHS = ['Paragraph owned by ana.'];
const ANA_PARAGRAPH = 'owned by ana';
const OFFLINE_MARKER = ' <ANA-OFFLINE>';
const DRAFT_TITLE = 'Unsaved title';
const SEED_TITLE = 'Plan';
const DOCUMENT_URL_PATTERN = /\/documents\/[^/]+$/;
const BEFORE_UNLOAD_EVENT = 'beforeunload';

let origin: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  origin = await startRestartableStack(RestartablePort.ExitConfirmation);
});

test.afterEach(async () => {
  await ensureServerRunning();
});

test.afterAll(async () => {
  await stopRestartableStack();
});

async function openOwnedDocument(browser: Parameters<typeof signedInContext>[0]['browser']) {
  const owner = await signedInContext({ browser, user: ana!, origin });
  await uploadSeed({ page: owner.page, paragraphs: PARAGRAPHS });
  return owner;
}

async function typeWhileServerIsDown(page: Page): Promise<void> {
  await stopServer();
  await expect(page.getByTestId(BANNER_TEST_ID)).toBeVisible({ timeout: LOST_TIMEOUT_MS });
  await insertInParagraph({ page, paragraphText: ANA_PARAGRAPH, text: OFFLINE_MARKER });
}

test('an edit typed while the server is down asks before leaving, Stay keeps it and a reconnect lets the user go', async ({ browser }) => {
  const { page } = await openOwnedDocument(browser);
  const documentUrl = page.url();
  await typeWhileServerIsDown(page);
  await brandLink(page).click();
  const dialog = page.getByRole('alertdialog', { name: EXIT_CONFIRMATION_TITLE });
  await expect(dialog).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL, exact: true }).click();
  await downloadPromise;
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: STAY_LABEL }).click();
  await expect(dialog).toBeHidden();
  expect(page.url()).toBe(documentUrl);
  expect(await readEditorText(page)).toContain(OFFLINE_MARKER);

  await startServer();
  await expect(page.getByTestId(BANNER_TEST_ID)).toHaveCount(0, { timeout: RECOVERY_TIMEOUT_MS });
  await brandLink(page).click();
  await expect(page).toHaveURL(new RegExp(`${AppRoute.Documents}$`));
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('Leave goes to the documents list while the edit is still unsynced', async ({ browser }) => {
  const { page } = await openOwnedDocument(browser);
  await typeWhileServerIsDown(page);
  await brandLink(page).click();
  await page.getByRole('alertdialog').getByRole('button', { name: LEAVE_LABEL }).click();
  await expect(page).toHaveURL(new RegExp(`${AppRoute.Documents}$`));
});

test('signing out while the title is changed asks first and Leave signs out', async ({ browser }) => {
  const { page } = await openOwnedDocument(browser);
  await titleButton({ page, title: SEED_TITLE }).click();
  await page.getByRole('textbox', { name: TITLE_LABEL }).fill(DRAFT_TITLE);
  await signOut({ page, name: ana!.name });
  const dialog = page.getByRole('alertdialog', { name: EXIT_CONFIRMATION_TITLE });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(DOCUMENT_URL_PATTERN);

  await dialog.getByRole('button', { name: STAY_LABEL }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(DOCUMENT_URL_PATTERN);

  await signOut({ page, name: ana!.name });
  await dialog.getByRole('button', { name: LEAVE_LABEL }).click();
  await expect(page).toHaveURL(new RegExp(`${AppRoute.SignIn}`));
});

test('closing the tab while an edit is unsynced asks the browser to confirm', async ({ browser }) => {
  const { page } = await openOwnedDocument(browser);
  await typeWhileServerIsDown(page);
  await expect
    .poll(() =>
      page.evaluate((eventName) => {
        const event = new Event(eventName, { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }, BEFORE_UNLOAD_EVENT),
    )
    .toBe(true);
});

test('a changed title asks before leaving until the edit is cancelled', async ({ browser }) => {
  const { page } = await openOwnedDocument(browser);
  await titleButton({ page, title: SEED_TITLE }).click();
  await page.getByRole('textbox', { name: TITLE_LABEL }).fill(DRAFT_TITLE);
  await brandLink(page).click();
  const dialog = page.getByRole('alertdialog', { name: EXIT_CONFIRMATION_TITLE });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: STAY_LABEL }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: CANCEL_TITLE_LABEL }).click();
  await brandLink(page).click();
  await expect(page).toHaveURL(new RegExp(`${AppRoute.Documents}$`));
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('an online edit never asks before leaving', async ({ browser }) => {
  const { page } = await openOwnedDocument(browser);
  await insertInParagraph({ page, paragraphText: ANA_PARAGRAPH, text: OFFLINE_MARKER });
  await brandLink(page).click();
  await expect(page).toHaveURL(new RegExp(`${AppRoute.Documents}$`));
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
