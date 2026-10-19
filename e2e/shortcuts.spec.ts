import type { Page } from '@playwright/test';
import { DEMO_USERS, ShareLinkRole } from '../libs/types/src';
import { NEW_DOCUMENT_LABEL } from '../apps/web/src/features/documents/documents-copy';
import { DOWNLOAD_LABEL, DOWNLOAD_PDF_LABEL } from '../apps/web/src/features/editor/editor-copy';
import { shortcutKeyParts } from '../apps/web/src/features/shortcuts/shortcut-keys';
import { ShortcutGroup, ShortcutId } from '../apps/web/src/features/shortcuts/shortcuts';
import { SHORTCUT_GROUP_LABELS, SHORTCUTS_SEARCH_LABEL, SHORTCUTS_TITLE } from '../apps/web/src/features/shortcuts/shortcuts-copy';
import { Platform } from '../apps/web/src/lib/platform';
import { downloadOptionsButton, EDITOR_READY_TIMEOUT_MS, editorText, shareAndAccept, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';

const EDITOR_TEST_ID = 'document-editor';
const LOCAL_CARET_SELECTOR = "[data-v2-local-selection-caret='true']";
const LINE_SELECTOR = '.superdoc-line';
const TYPED_WORD = 'Shortcut';
const SEED_PARAGRAPH = 'Paragraph owned by ana.';
const BOLD_WEIGHT = 700;
const CENTERED = 'center';
const MODIFIER = 'ControlOrMeta';
const platform = process.platform === 'darwin' ? Platform.Mac : Platform.Other;

async function openNewDocumentWithSelectedWord(page: Page): Promise<void> {
  await page.getByRole('button', { name: NEW_DOCUMENT_LABEL }).click();
  await expect(page.getByTestId(EDITOR_TEST_ID)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await expect(page.locator(LOCAL_CARET_SELECTOR)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await page.keyboard.type(TYPED_WORD);
  await expect(editorText(page).filter({ hasText: TYPED_WORD }).first()).toBeVisible();
  await page.keyboard.press('Shift+Home');
}

function wordRun(page: Page) {
  return editorText(page).filter({ hasText: TYPED_WORD }).first();
}

function fontWeightOf(page: Page): Promise<number> {
  return wordRun(page).evaluate((element) => Number(getComputedStyle(element).fontWeight));
}

function fontSizeOf(page: Page): Promise<number> {
  return wordRun(page).evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
}

test('Mod+B bolds the selected word', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  expect(await fontWeightOf(ana.page)).toBeLessThan(BOLD_WEIGHT);
  await ana.page.keyboard.press(`${MODIFIER}+B`);
  await expect.poll(() => fontWeightOf(ana.page)).toBeGreaterThanOrEqual(BOLD_WEIGHT);
});

test('Mod+Alt+1 turns the paragraph into a heading', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  const bodySize = await fontSizeOf(ana.page);
  await ana.page.keyboard.press(`${MODIFIER}+Alt+1`);
  await expect.poll(() => fontSizeOf(ana.page)).toBeGreaterThan(bodySize);
});

test('Mod+E centres the paragraph through the command surface', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  await ana.page.keyboard.press(`${MODIFIER}+E`);
  await expect
    .poll(() =>
      ana.page
        .locator(LINE_SELECTOR)
        .first()
        .evaluate((element) => getComputedStyle(element).textAlign),
    )
    .toBe(CENTERED);
});

test('Mod+S downloads the DOCX', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  const download = ana.page.waitForEvent('download');
  await ana.page.keyboard.press(`${MODIFIER}+S`);
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);
});

test('Mod+/ opens the shortcuts dialog, the search filters it and Escape closes it', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  await ana.page.keyboard.press(`${MODIFIER}+/`);
  const dialog = ana.page.getByRole('dialog', { name: SHORTCUTS_TITLE });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox', { name: SHORTCUTS_SEARCH_LABEL }).fill('head');
  await expect(dialog.getByText('Heading 1', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Bold', { exact: true })).toHaveCount(0);
  await ana.page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the download menu shows the save and print hints', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  await downloadOptionsButton(ana.page).click();
  const hintOf = async (name: string, id: ShortcutId) => {
    const item = ana.page.getByRole('menuitem', { name });
    await expect(item.locator('kbd')).toHaveText(shortcutKeyParts({ id, platform }));
  };
  await hintOf(DOWNLOAD_LABEL, ShortcutId.DownloadDocx);
  await hintOf(DOWNLOAD_PDF_LABEL, ShortcutId.DownloadPdf);
});

test('a reader sees no formatting group in the dialog', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: [SEED_PARAGRAPH] });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Read });
  await bruno.page.keyboard.press(`${MODIFIER}+/`);
  const dialog = bruno.page.getByRole('dialog', { name: SHORTCUTS_TITLE });
  await expect(dialog.getByRole('heading', { name: SHORTCUT_GROUP_LABELS[ShortcutGroup.Document] })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: SHORTCUT_GROUP_LABELS[ShortcutGroup.Formatting] })).toHaveCount(0);
});
