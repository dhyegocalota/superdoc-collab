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
const EDIT_TEXT = ' More money for the plan, a second sentence about the budget lines and a third one about the hiring plan.';
const BAND_NAME = 'Budget';
const PHONE_VIEWPORT = { width: 375, height: 568 };
const NARROWEST_PHONE_VIEWPORT = { width: 320, height: 568 };
const DEBOUNCE_WINDOW_MS = 1_000;
const CHART_CENTRE_FRACTION = 0.5;
const PANEL_BODY_SELECTOR = 'aside [data-panel-body]';
const PIXEL_TOLERANCE = 1;
const VERSION_PATH_PATTERN = /\/versions\/\d+$/;
const SELECTED_HEADER_SELECTOR = 'aside [data-selected-header]';
const EDITOR_SURFACE_TEST_ID = 'editor-surface';
const DIMMED_CLASS = /opacity-60/;
const CHARACTER_COUNT_PATTERN = /\d+ characters?/;

type Rect = { top: number; bottom: number };

async function rectsOf({ header, scroller }: { header: Locator; scroller: Locator }): Promise<{ headerRect: Rect; scrollerRect: Rect }> {
  const headerRect = await header.evaluate((element) => element.getBoundingClientRect().toJSON() as Rect);
  const scrollerRect = await scroller.evaluate((element) => element.getBoundingClientRect().toJSON() as Rect);
  return { headerRect, scrollerRect };
}

function isInside({ inner, outer }: { inner: Rect; outer: Rect }): boolean {
  return inner.top >= outer.top - PIXEL_TOLERANCE && inner.bottom <= outer.bottom + PIXEL_TOLERANCE;
}

type Box = { x: number; y: number; width: number; height: number } | null;

function boxesIntersect({ first, second }: { first: Box; second: Box }): boolean {
  if (first === null || second === null) throw new Error('A box is missing');
  const overlapsHorizontally = first.x < second.x + second.width && second.x < first.x + first.width;
  const overlapsVertically = first.y < second.y + second.height && second.y < first.y + first.height;
  return overlapsHorizontally && overlapsVertically;
}

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

  await clickChart({ page: ana.page, widthFraction: CHART_CENTRE_FRACTION });
  await expect(header).toContainText(CHARACTER_COUNT_PATTERN);
  const scroller = ana.page.locator(PANEL_BODY_SELECTOR);
  await expect
    .poll(() => rectsOf({ header, scroller }).then(({ headerRect, scrollerRect }) => isInside({ inner: headerRect, outer: scrollerRect })))
    .toBe(true);
  await scroller.evaluate((element) => element.scrollTo({ top: 0 }));
  const naturalOffset = await rectsOf({ header, scroller }).then(({ headerRect, scrollerRect }) => headerRect.top - scrollerRect.top);
  const maxScroll = await scroller.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(maxScroll, 'the panel must scroll further than the header offset, or the header never has to stick').toBeGreaterThan(
    naturalOffset,
  );
  await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect
    .poll(() => rectsOf({ header, scroller }).then(({ headerRect, scrollerRect }) => headerRect.top - scrollerRect.top))
    .toBeCloseTo(Math.max(0, naturalOffset - maxScroll), 0);
  await scroller.evaluate((element) => element.scrollTo({ top: 0 }));
  const hiddenBeforeRepeatTap = await rectsOf({ header, scroller }).then(
    ({ headerRect, scrollerRect }) => !isInside({ inner: headerRect, outer: scrollerRect }),
  );
  expect(hiddenBeforeRepeatTap, 'the header must start below the fold or the repeat tap proves nothing').toBe(true);
  await clickChart({ page: ana.page, widthFraction: CHART_CENTRE_FRACTION });
  await expect
    .poll(() => rectsOf({ header, scroller }).then(({ headerRect, scrollerRect }) => isInside({ inner: headerRect, outer: scrollerRect })))
    .toBe(true);
  await expect(header).toBeInViewport();
  await expect(ana.page.getByRole('button', { name: VIEW_VERSION_LABEL, exact: true })).toBeVisible();
  await ana.page.setViewportSize(NARROWEST_PHONE_VIEWPORT);
  await expect.poll(() => header.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const rangeBox = await header.locator('p').boundingBox();
  const buttonBox = await ana.page.getByRole('button', { name: VIEW_VERSION_LABEL, exact: true }).boundingBox();
  expect(boxesIntersect({ first: rangeBox, second: buttonBox })).toBe(false);
  await ana.page.setViewportSize(PHONE_VIEWPORT);
  await expectStableFor({ read: async () => String(currentAt(ana.page)), expected: 'null', durationMs: DEBOUNCE_WINDOW_MS });
  expect(requests).toHaveLength(0);

  await ana.page.getByRole('button', { name: VIEW_VERSION_LABEL, exact: true }).click();
  await expect(ana.page.getByRole('status', { name: LOADING_VERSION_MESSAGE })).toBeVisible();
  await expect(ana.page.getByTestId(EDITOR_SURFACE_TEST_ID)).toHaveClass(DIMMED_CLASS);
  await expect(chartSvg(ana.page).locator('xpath=..')).toHaveAttribute('aria-busy', 'true');
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
  await clickChart({ page: ana.page, widthFraction: CHART_CENTRE_FRACTION });
  await expect.poll(() => currentAt(ana.page), { timeout: VERSION_TIMEOUT_MS }).not.toBeNull();
  await expect(ana.page.getByRole('button', { name: VIEW_VERSION_LABEL, exact: true })).toHaveCount(0);
  await expect(ana.page.getByText(SHOWING_WHOLE_DOCUMENT_MESSAGE)).toHaveCount(0);
});
