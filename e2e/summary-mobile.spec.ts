import type { Browser, Locator, Page } from '@playwright/test';
import { DEMO_USERS } from '../libs/types/src';
import { TIMELINE_TOGGLE_LABEL } from '../apps/web/src/features/editor/editor-copy';
import {
  BACK_TO_LIVE_LABEL,
  LOADING_VERSION_MESSAGE,
  SHOWING_WHOLE_DOCUMENT_MESSAGE,
  VIEW_VERSION_LABEL,
} from '../apps/web/src/features/timeline/timeline-copy';
import { typeInParagraph, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import {
  currentAt,
  chartSvg,
  clickChart,
  expectStableFor,
  VERSION_TIMEOUT_MS,
  versionBanner,
  viewerFrame,
  waitForBands,
  waitForSettledTimeline,
} from './timeline';

const PARAGRAPHS = ['Budget: the plan costs 10.', 'Hiring: we add two people.'];
const EDIT_TEXT = ' More money';
const BAND_NAME = 'Budget';
const PHONE_VIEWPORT = { width: 375, height: 812 };
const DEBOUNCE_WINDOW_MS = 1_000;
const FIRST_BIN_POSITION = { x: 1, y: 40 };
const LAST_BIN_POSITION = { x: 340, y: 40 };
const VERSION_PATH_PATTERN = /\/versions\/\d+$/;
const SELECTED_HEADER_SELECTOR = 'aside [aria-live="polite"]';
const EDITOR_SURFACE_TEST_ID = 'editor-surface';
const DIMMED_CLASS = /opacity-60/;
const EDIT_COUNT_PATTERN = /\d+ edits?/;

async function ownerWithEdit(browser: Browser) {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: EDIT_TEXT });
  await waitForBands({ page: ana.page, names: [BAND_NAME] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  return { ana, documentId };
}

async function holdVersionRequests(page: Page): Promise<{ release: () => void; requests: string[] }> {
  const requests: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => VERSION_PATH_PATTERN.test(url.pathname),
    async (route) => {
      requests.push(route.request().url());
      await gate;
      await route.continue();
    },
  );
  return { release, requests };
}

test('on a phone a tap keeps the selected header in view and a version needs View version', async ({ browser }) => {
  const { ana } = await ownerWithEdit(browser);
  const { release, requests } = await holdVersionRequests(ana.page);
  await ana.page.setViewportSize(PHONE_VIEWPORT);
  await ana.page.reload();
  await ana.page.getByRole('button', { name: TIMELINE_TOGGLE_LABEL }).click();
  await waitForBands({ page: ana.page, names: [BAND_NAME] });
  const header = ana.page.locator(SELECTED_HEADER_SELECTOR);
  await expect(header).toContainText(SHOWING_WHOLE_DOCUMENT_MESSAGE);

  await clickChart({ page: ana.page, position: FIRST_BIN_POSITION });
  await expect(header).toContainText(EDIT_COUNT_PATTERN);
  await expect(header).toBeInViewport();
  await expect(ana.page.getByRole('button', { name: VIEW_VERSION_LABEL })).toBeVisible();
  await expectStableFor({ read: async () => String(currentAt(ana.page)), expected: 'null', durationMs: DEBOUNCE_WINDOW_MS });
  expect(requests).toHaveLength(0);

  await ana.page.getByRole('button', { name: VIEW_VERSION_LABEL }).click();
  await expect(ana.page.getByRole('status', { name: LOADING_VERSION_MESSAGE })).toBeVisible();
  await expect(ana.page.getByTestId(EDITOR_SURFACE_TEST_ID)).toHaveClass(DIMMED_CLASS);
  await expect(chartSvg(ana.page).locator('xpath=..')).toHaveAttribute('aria-busy', 'true');
  const loadingAt = currentAt(ana.page);
  await clickChart({ page: ana.page, position: LAST_BIN_POSITION });
  await expectStableFor({ read: async () => String(currentAt(ana.page)), expected: String(loadingAt), durationMs: DEBOUNCE_WINDOW_MS });
  expect(requests).toHaveLength(1);

  release();
  await expect(versionBanner(ana.page)).toHaveAttribute('data-sequence', /\d+/, { timeout: VERSION_TIMEOUT_MS });
  await expect(viewerFrame(ana.page).locator('body')).toBeVisible({ timeout: VERSION_TIMEOUT_MS });
  await expect(ana.page.getByRole('status', { name: LOADING_VERSION_MESSAGE })).toHaveCount(0);
  await expect(ana.page.getByTestId(EDITOR_SURFACE_TEST_ID)).not.toHaveClass(DIMMED_CLASS);
  const backToLive = ana.page.getByRole('button', { name: BACK_TO_LIVE_LABEL });
  await expect(backToLive).toBeInViewport();
  await backToLive.click();
  expect(currentAt(ana.page)).toBeNull();
  await expect(versionBanner(ana.page)).toHaveCount(0);
});

test('on desktop a tap travels at once', async ({ browser }) => {
  const { ana } = await ownerWithEdit(browser);
  await clickChart({ page: ana.page, position: FIRST_BIN_POSITION });
  await expect.poll(() => currentAt(ana.page), { timeout: VERSION_TIMEOUT_MS }).not.toBeNull();
  await expect(ana.page.getByRole('button', { name: VIEW_VERSION_LABEL })).toHaveCount(0);
  await expect(ana.page.getByText(SHOWING_WHOLE_DOCUMENT_MESSAGE)).toHaveCount(0);
});
