import type { Page } from '@playwright/test';
import { DEMO_USERS, ShareLinkRole } from '../libs/types/src';
import { ADD_COMMENT_SUBMIT_LABEL, ADD_COMMENT_TITLE, COMMENT_TEXT_LABEL } from '../apps/web/src/features/editor/editor-copy';
import { NEW_DOCUMENT_LABEL } from '../apps/web/src/features/documents/documents-copy';
import { DOWNLOAD_LABEL, DOWNLOAD_PDF_LABEL } from '../apps/web/src/features/editor/editor-copy';
import { shortcutKeyParts, shortcutLabel } from '../apps/web/src/features/shortcuts/shortcut-keys';
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
const TRACKED_TEXT = 'Zed';
const UNTRACKED_TEXT = 'Quo';
const TRACKED_INSERT_SELECTOR = '[data-track-change-kind="insert"]';
const COMMENT_TEXT = 'Please check this word';
const PANEL_SELECTOR = 'aside[data-position]';
const CENTERED = 'center';
const RIGHT_ALIGNED = 'right';
const RELOAD_KEY_COMBINATIONS = ['R', 'Shift+R'];
const MAC_PLATFORM_PATTERN = /mac/i;

async function platformOf(page: Page): Promise<Platform> {
  const platformName = await page.evaluate(() => {
    const { userAgentData, platform } = navigator as Navigator & { userAgentData?: { platform: string } };
    return platform === '' && userAgentData ? userAgentData.platform : platform;
  });
  return MAC_PLATFORM_PATTERN.test(platformName) ? Platform.Mac : Platform.Other;
}

async function pressWithModifier({ page, keys }: { page: Page; keys: string }): Promise<void> {
  const modifier = (await platformOf(page)) === Platform.Mac ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+${keys}`);
}

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
  await pressWithModifier({ page: ana.page, keys: 'B' });
  await expect.poll(() => fontWeightOf(ana.page)).toBeGreaterThanOrEqual(BOLD_WEIGHT);
});

test('Mod+Alt+1 turns the paragraph into a heading', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  const bodySize = await fontSizeOf(ana.page);
  await pressWithModifier({ page: ana.page, keys: 'Alt+1' });
  await expect.poll(() => fontSizeOf(ana.page)).toBeGreaterThan(bodySize);
});

test('Mod+E centres the paragraph through the command surface', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  await pressWithModifier({ page: ana.page, keys: 'E' });
  await expect
    .poll(() =>
      ana.page
        .locator(LINE_SELECTOR)
        .first()
        .evaluate((element) => getComputedStyle(element).textAlign),
    )
    .toBe(CENTERED);
});

function textAlignOf(page: Page): Promise<string> {
  return page
    .locator(LINE_SELECTOR)
    .first()
    .evaluate((element) => getComputedStyle(element).textAlign);
}

async function reloadKeyDefaultPrevented({ page, keys }: { page: Page; keys: string }): Promise<boolean | undefined> {
  await page.evaluate(() => {
    const flags = window as Window & { reloadKeyEvent?: KeyboardEvent };
    flags.reloadKeyEvent = undefined;
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.code === 'KeyR') flags.reloadKeyEvent = event;
      },
      true,
    );
  });
  await pressWithModifier({ page, keys });
  return page.evaluate(() => (window as Window & { reloadKeyEvent?: KeyboardEvent }).reloadKeyEvent?.defaultPrevented);
}

test('Mod+Alt+R aligns right and the reload keys are left alone', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  for (const keys of RELOAD_KEY_COMBINATIONS) {
    expect(await reloadKeyDefaultPrevented({ page: ana.page, keys })).toBe(false);
    expect(await textAlignOf(ana.page)).not.toBe(RIGHT_ALIGNED);
  }
  await pressWithModifier({ page: ana.page, keys: 'Alt+R' });
  await expect.poll(() => textAlignOf(ana.page)).toBe(RIGHT_ALIGNED);
});

test('Mod+S downloads the DOCX', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  const download = ana.page.waitForEvent('download');
  await pressWithModifier({ page: ana.page, keys: 'S' });
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);
});

test('Mod+/ opens the shortcuts dialog, the search filters it and Escape closes it', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  await pressWithModifier({ page: ana.page, keys: '/' });
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
    await expect(item.locator('kbd')).toHaveText(shortcutKeyParts({ id, platform: await platformOf(ana.page) }));
  };
  await hintOf(DOWNLOAD_LABEL, ShortcutId.DownloadDocx);
  await hintOf(DOWNLOAD_PDF_LABEL, ShortcutId.DownloadPdf);
});

test('a reader sees no formatting group in the dialog', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: [SEED_PARAGRAPH] });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Read });
  await pressWithModifier({ page: bruno.page, keys: '/' });
  const dialog = bruno.page.getByRole('dialog', { name: SHORTCUTS_TITLE });
  await expect(dialog.getByRole('heading', { name: SHORTCUT_GROUP_LABELS[ShortcutGroup.Document] })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: SHORTCUT_GROUP_LABELS[ShortcutGroup.Formatting] })).toHaveCount(0);
});

test('Mod+Alt+M comments on the selected word', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  await pressWithModifier({ page: ana.page, keys: 'Alt+M' });
  const dialog = ana.page.getByRole('dialog', { name: ADD_COMMENT_TITLE });
  await dialog.getByRole('textbox', { name: COMMENT_TEXT_LABEL }).fill(COMMENT_TEXT);
  await dialog.getByRole('button', { name: ADD_COMMENT_SUBMIT_LABEL }).click();
  await expect(dialog).toBeHidden();
  await expect(ana.page.getByText(COMMENT_TEXT)).toBeVisible();
});

test('Mod+Alt+E opens the edits panel and a second press closes it', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  const panel = ana.page.locator(PANEL_SELECTOR);
  await pressWithModifier({ page: ana.page, keys: 'Alt+E' });
  await expect(panel).toHaveAttribute('data-state', 'open');
  await pressWithModifier({ page: ana.page, keys: 'Alt+E' });
  await expect(panel).toHaveAttribute('data-state', 'collapsed');
});

test('Mod+Alt+T switches to suggesting, typing is tracked, and a second press stops tracking', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  await ana.page.keyboard.press('End');
  await pressWithModifier({ page: ana.page, keys: 'Alt+T' });
  await ana.page.keyboard.type(TRACKED_TEXT);
  const trackedRuns = ana.page.locator(TRACKED_INSERT_SELECTOR);
  await expect(trackedRuns).toHaveText(TRACKED_TEXT);
  await pressWithModifier({ page: ana.page, keys: 'Alt+T' });
  await ana.page.keyboard.type(UNTRACKED_TEXT);
  await expect(editorText(ana.page).filter({ hasText: UNTRACKED_TEXT }).first()).toBeVisible();
  await expect(trackedRuns).toHaveText(TRACKED_TEXT);
});

const CONTEXT_MENU_ITEM_SELECTOR = '.v2-context-menu__item';
const CONTEXT_MENU_SHORTCUT_SELECTOR = '.v2-context-menu__shortcut';

test('the right-click menu shows the registry keys beside Comment and Insert link', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  await wordRun(ana.page).dblclick();
  await wordRun(ana.page).click({ button: 'right' });
  const platform = await platformOf(ana.page);
  const hintOf = (name: string) =>
    ana.page.locator(CONTEXT_MENU_ITEM_SELECTOR).filter({ hasText: name }).locator(CONTEXT_MENU_SHORTCUT_SELECTOR);
  await expect(hintOf('Comment')).toHaveText(shortcutLabel({ id: ShortcutId.AddComment, platform }));
  await expect(hintOf('Insert link')).toHaveText(shortcutLabel({ id: ShortcutId.Link, platform }));
  await expect(hintOf('Cut')).toHaveText(shortcutLabel({ id: ShortcutId.Cut, platform }));
  await expect(hintOf('Insert footnote')).toHaveText(shortcutLabel({ id: ShortcutId.InsertFootnote, platform }));
  await expect(hintOf('Insert table')).toHaveCount(0);
});

test('Mod+Alt+F inserts a footnote', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await openNewDocumentWithSelectedWord(ana.page);
  await ana.page.keyboard.press('End');
  await expect(ana.page.locator(LINE_SELECTOR)).toHaveCount(1);
  await pressWithModifier({ page: ana.page, keys: 'Alt+F' });
  await expect(ana.page.locator(LINE_SELECTOR)).toHaveCount(2);
});
