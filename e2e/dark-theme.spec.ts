import type { Browser, Page } from '@playwright/test';
import { DEMO_USERS } from '../libs/types/src';
import { THEME_STORAGE_KEY, ThemePreference } from '../apps/web/src/lib/use-theme';
import { editorText, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import { BUDGET_PARAGRAPH } from './timeline';

const [anaUser] = DEMO_USERS;
const VIEWPORT = { width: 1280, height: 800 };
const CARET_SELECTOR = "[data-v2-local-selection-caret='true']";
const FONT_FAMILY_TOGGLE_SELECTOR = "[data-item='btn-fontFamily-toggle']";
const DROPDOWN_SELECTOR = "[data-sd-part='dropdown-menu']";
const DROPDOWN_OPTION_SELECTOR = "[role='option']";
const BOLD_BUTTON_SELECTOR = "[data-item='btn-bold']";
const SELECTED_OPTION_SELECTOR = `${DROPDOWN_SELECTOR} .sd-selected`;
const AWAY_FROM_TOOLBAR = { x: 0, y: 0 };
const DARK_COLOR_SCHEME = 'dark';

enum CssProperty {
  Color = 'color',
  BackgroundColor = 'background-color',
}

async function openedEditorIn({ browser, theme }: { browser: Browser; theme: ThemePreference }): Promise<Page> {
  const { page } = await signedInContext({ browser, user: anaUser! });
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_STORAGE_KEY, value: theme });
  await uploadSeed({ page, paragraphs: [BUDGET_PARAGRAPH] });
  return page;
}

function tokenValue({ page, token, property }: { page: Page; token: string; property: CssProperty }): Promise<string> {
  return page.evaluate(
    ({ tokenName, propertyName }) => {
      const probe = document.createElement('div');
      probe.style.setProperty(propertyName, `var(${tokenName})`);
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(propertyName);
      probe.remove();
      return value;
    },
    { tokenName: token, propertyName: property },
  );
}

function computedValue({ page, selector, property }: { page: Page; selector: string; property: CssProperty }): Promise<string> {
  return page.evaluate(
    ({ elementSelector, propertyName }) => getComputedStyle(document.querySelector(elementSelector)!).getPropertyValue(propertyName),
    { elementSelector: selector, propertyName: property },
  );
}

async function placeCaret(page: Page): Promise<void> {
  await editorText(page).filter({ hasText: BUDGET_PARAGRAPH }).first().click();
  await expect(page.locator(CARET_SELECTOR)).toHaveCount(1);
}

async function openFontFamilyDropdown(page: Page): Promise<void> {
  await page.locator(FONT_FAMILY_TOGGLE_SELECTOR).click();
  await expect(page.locator(DROPDOWN_SELECTOR)).toBeVisible();
}

async function expectActiveSurfacesFollowTheToken(page: Page): Promise<void> {
  const activeBackground = await tokenValue({ page, token: '--active', property: CssProperty.BackgroundColor });
  await page.locator(BOLD_BUTTON_SELECTOR).click();
  await page.mouse.move(AWAY_FROM_TOOLBAR.x, AWAY_FROM_TOOLBAR.y);
  await expect
    .poll(() => computedValue({ page, selector: BOLD_BUTTON_SELECTOR, property: CssProperty.BackgroundColor }))
    .toBe(activeBackground);
  await openFontFamilyDropdown(page);
  await expect(page.locator(SELECTED_OPTION_SELECTOR)).toBeVisible();
  expect(await computedValue({ page, selector: SELECTED_OPTION_SELECTOR, property: CssProperty.BackgroundColor })).toBe(activeBackground);
}

async function expectCaretAndDropdownFollowTheTokens(page: Page): Promise<void> {
  await placeCaret(page);
  expect(await computedValue({ page, selector: CARET_SELECTOR, property: CssProperty.Color })).toBe(
    await tokenValue({ page, token: '--paper-foreground', property: CssProperty.Color }),
  );
  await expectActiveSurfacesFollowTheToken(page);
  expect(await computedValue({ page, selector: DROPDOWN_SELECTOR, property: CssProperty.BackgroundColor })).toBe(
    await tokenValue({ page, token: '--popover', property: CssProperty.BackgroundColor }),
  );
  const dropdownOption = page.locator(DROPDOWN_SELECTOR).locator(DROPDOWN_OPTION_SELECTOR).first();
  await dropdownOption.hover();
  expect(await computedValue({ page, selector: `${DROPDOWN_SELECTOR} ${DROPDOWN_OPTION_SELECTOR}`, property: CssProperty.Color })).toBe(
    await tokenValue({ page, token: '--foreground', property: CssProperty.Color }),
  );
}

test('in dark mode the caret is dark on the paper, the font dropdown is readable and native controls follow the theme', async ({
  browser,
}) => {
  const page = await openedEditorIn({ browser, theme: ThemePreference.Dark });
  await expectCaretAndDropdownFollowTheTokens(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(DARK_COLOR_SCHEME);
});

test('in light mode nothing regressed', async ({ browser }) => {
  const page = await openedEditorIn({ browser, theme: ThemePreference.Light });
  await expectCaretAndDropdownFollowTheTokens(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).not.toBe(DARK_COLOR_SCHEME);
});
