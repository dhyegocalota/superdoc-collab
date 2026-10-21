import type { Page } from '@playwright/test';
import { DEMO_USERS } from '../libs/types/src';
import { EDITOR_THEME_PRESET_LABELS, THEME_LABEL } from '../apps/web/src/features/editor/editor-copy';
import { EDITOR_THEME_STORAGE_KEY, EditorThemePreset } from '../apps/web/src/features/editor/editor-theme';
import { EDITOR_INPUT_SELECTOR, EDITOR_READY_TIMEOUT_MS, liveEditorText, toolbarRow, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import { BUDGET_PARAGRAPH } from './timeline';

const [anaUser] = DEMO_USERS;
const RULER_BUTTON_SELECTOR = "[data-item^='btn-ruler']";
const RULER_SELECTOR = '.v2-ruler-host *';
const MODE_TOGGLE_SELECTOR = "[data-item^='btn-documentMode']";
const OPTION_SELECTOR = "[role='option']";
const ACTION_COLOR_PROBE = 'rgb(3, 105, 161)';
const TOGGLE_MODE_SHORTCUT = 'ControlOrMeta+Alt+T';

enum DocumentModeLabel {
  Editing = 'Editing',
  Suggesting = 'Suggesting',
  Viewing = 'Viewing',
}

async function chooseMode({ page, mode }: { page: Page; mode: DocumentModeLabel }): Promise<void> {
  await toolbarRow(page).locator(MODE_TOGGLE_SELECTOR).first().click();
  await page.locator(OPTION_SELECTOR).filter({ hasText: mode }).first().click();
}

function modeToggle(page: Page) {
  return toolbarRow(page).locator(MODE_TOGGLE_SELECTOR).first();
}

function actionColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--sd-ui-action)';
    document.body.append(probe);
    const { color } = getComputedStyle(probe);
    probe.remove();
    return color;
  });
}

test('the toolbar toggles the ruler, switches the mode and keeps a theme across a reload', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: anaUser! });
  const { page } = ana;
  await uploadSeed({ page, paragraphs: [BUDGET_PARAGRAPH] });

  await expect(page.locator(RULER_SELECTOR)).toHaveCount(0);
  await toolbarRow(page).locator(RULER_BUTTON_SELECTOR).first().click();
  await expect(page.locator(RULER_SELECTOR).first()).toBeVisible();
  await toolbarRow(page).locator(RULER_BUTTON_SELECTOR).first().click();
  await expect(page.locator(RULER_SELECTOR)).toHaveCount(0);

  await expect(modeToggle(page)).toContainText(DocumentModeLabel.Editing);
  await chooseMode({ page, mode: DocumentModeLabel.Suggesting });
  await expect(modeToggle(page)).toContainText(DocumentModeLabel.Suggesting);
  await page.keyboard.press(TOGGLE_MODE_SHORTCUT);
  await expect(modeToggle(page)).toContainText(DocumentModeLabel.Editing);
  await chooseMode({ page, mode: DocumentModeLabel.Viewing });
  await expect(modeToggle(page)).toContainText(DocumentModeLabel.Viewing);
  await expect(page.locator(EDITOR_INPUT_SELECTOR)).toHaveCount(0);

  const defaultColor = await actionColor(page);
  await page.getByRole('button', { name: THEME_LABEL }).click();
  await page.getByRole('radio', { name: EDITOR_THEME_PRESET_LABELS[EditorThemePreset.Ocean] }).click();
  await expect.poll(() => actionColor(page)).toBe(ACTION_COLOR_PROBE);
  expect(defaultColor).not.toBe(ACTION_COLOR_PROBE);
  expect(await page.evaluate((key) => localStorage.getItem(key), EDITOR_THEME_STORAGE_KEY)).toBe(EditorThemePreset.Ocean);

  await page.reload();
  await expect(liveEditorText(page).filter({ hasText: BUDGET_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await expect.poll(() => actionColor(page)).toBe(ACTION_COLOR_PROBE);
  await page.getByRole('button', { name: THEME_LABEL }).click();
  await expect(page.getByRole('radio', { name: EDITOR_THEME_PRESET_LABELS[EditorThemePreset.Ocean] })).toBeChecked();
});
