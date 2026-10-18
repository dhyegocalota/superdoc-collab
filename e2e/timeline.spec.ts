import { TimelineSearchParam, TOPICS_UNAVAILABLE_MESSAGE } from '../libs/types/src';
import { bandAriaLabel, removeFilterLabel, RETRY_TOPICS_LABEL, TOP_EDITS_LABEL } from '../apps/web/src/features/timeline/timeline-copy';
import { typeInParagraph } from './editor';
import { expect, test } from './fixtures';
import {
  BRUNO,
  BUDGET,
  BUDGET_PARAGRAPH,
  bandNamed,
  bandVolume,
  BANDS_TIMEOUT_MS,
  currentAt,
  filterBy,
  HIRING,
  HIRING_PARAGRAPH,
  pressInChart,
  readTimeline,
  ruleX,
  summarizeButton,
  summaryCard,
  twoAuthorsInTwoTopics,
  VERSION_TIMEOUT_MS,
  waitForBands,
  waitForSettledTimeline,
} from './timeline';

const RENAMED_PREFIX = 'Staff ';
const LONG_TYPING_LENGTH = 200;
const LONG_TYPING_DELAY_MS = 100;
const NARROW_VIEWPORT = { width: 375, height: 812 };
const VERSION_REQUEST_PATTERN = /\/versions\/\d+$/;
const FILTER_TIMEOUT_MS = 30_000;
const SUMMARY_TIMEOUT_MS = 30_000;
const EDITED_PHRASE = 'edited';

function topEdits(page: Parameters<typeof waitForBands>[0]['page']) {
  return page.getByRole('heading', { name: TOP_EDITS_LABEL }).locator('..').getByRole('listitem');
}

test('two authors type in two topics and the bands appear', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await summarizeButton(ana.page).click();
  await expect(topEdits(ana.page).filter({ hasText: BUDGET })).toContainText(`Edits about ${BUDGET}.`, { timeout: BANDS_TIMEOUT_MS });
  await expect(topEdits(ana.page).filter({ hasText: HIRING }).getByTitle(BRUNO)).toBeVisible();
});

test('Summarize edits regroups the topics from the current text', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  const volumeBefore = await bandVolume({ page: ana.page, name: HIRING });
  await typeInParagraph({ page: ana.page, paragraphText: HIRING, text: '' });
  await ana.page.keyboard.press('Home');
  await ana.page.keyboard.type(RENAMED_PREFIX);
  await expect.poll(() => bandVolume({ page: ana.page, name: HIRING }), { timeout: BANDS_TIMEOUT_MS }).toBeGreaterThan(volumeBefore);
  await summarizeButton(ana.page).click();
  await waitForBands({ page: ana.page, names: [`${RENAMED_PREFIX}${HIRING}`] });
});

test('filters by person and term hide the other author and survive a reload', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await filterBy({ page: ana.page, text: '@bruno' });
  await expect(ana.page).toHaveURL(new RegExp(`${TimelineSearchParam.Author}=bruno`));
  await expect(bandNamed({ page: ana.page, name: BUDGET })).toHaveAttribute('aria-label', bandAriaLabel({ name: BUDGET, volume: 0 }), {
    timeout: FILTER_TIMEOUT_MS,
  });
  await expect(topEdits(ana.page).filter({ hasText: HIRING })).toHaveCount(1);
  await expect(topEdits(ana.page).filter({ hasText: BUDGET })).toHaveCount(0);
  await filterBy({ page: ana.page, text: 'designer' });
  await expect(ana.page).toHaveURL(new RegExp(`${TimelineSearchParam.Term}=designer`));
  await ana.page.reload();
  await expect(ana.page.getByRole('button', { name: removeFilterLabel('designer') })).toBeVisible({ timeout: BANDS_TIMEOUT_MS });
  await expect(ana.page).toHaveURL(new RegExp(`${TimelineSearchParam.Author}=bruno`));
  await expect(bandNamed({ page: ana.page, name: BUDGET })).toHaveAttribute('aria-label', bandAriaLabel({ name: BUDGET, volume: 0 }), {
    timeout: FILTER_TIMEOUT_MS,
  });
  await expect.poll(() => bandVolume({ page: ana.page, name: HIRING })).toBeGreaterThan(0);
});

test('a band appears while the other author is still typing', async ({ browser }) => {
  const { ana, bruno } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await typeInParagraph({ page: bruno.page, paragraphText: 'Hiring:', text: '' });
  let isTyping = true;
  const typing = bruno.page.keyboard.type('x'.repeat(LONG_TYPING_LENGTH), { delay: LONG_TYPING_DELAY_MS }).finally(() => {
    isTyping = false;
  });
  const first = await bandVolume({ page: ana.page, name: HIRING });
  await expect.poll(() => bandVolume({ page: ana.page, name: HIRING }), { timeout: BANDS_TIMEOUT_MS }).toBeGreaterThan(first);
  const second = await bandVolume({ page: ana.page, name: HIRING });
  await expect.poll(() => bandVolume({ page: ana.page, name: HIRING }), { timeout: BANDS_TIMEOUT_MS }).toBeGreaterThan(second);
  expect(isTyping).toBe(true);
  await typing;
});

test('keyboard moves the selected bin and two quick presses navigate once', async ({ browser }) => {
  const { ana, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  const { bins } = await readTimeline({ page: ana.page, documentId });
  await pressInChart({ page: ana.page, name: BUDGET, keys: ['End'] });
  await expect.poll(() => currentAt(ana.page), { timeout: VERSION_TIMEOUT_MS }).toBe(bins.at(-1)!.start);
  const lastRule = await ruleX(ana.page);
  const navigations: string[] = [];
  ana.page.on('framenavigated', (frame) => navigations.push(frame.url()));
  const versionRequests: string[] = [];
  ana.page.on('request', (request) => {
    if (VERSION_REQUEST_PATTERN.test(new URL(request.url()).pathname)) versionRequests.push(request.url());
  });
  await ana.page.keyboard.press('ArrowLeft');
  await ana.page.keyboard.press('ArrowLeft');
  await expect.poll(() => currentAt(ana.page), { timeout: VERSION_TIMEOUT_MS }).toBe(bins.at(-3)!.start);
  expect(await ruleX(ana.page)).toBeLessThan(lastRule);
  expect(navigations.filter((url) => url.includes(`${TimelineSearchParam.At}=`))).toHaveLength(1);
  expect(versionRequests.length).toBeLessThanOrEqual(1);
});

test('narrow viewport stacks the panel and fits the summary', async ({ browser }) => {
  const { ana, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await ana.page.setViewportSize(NARROW_VIEWPORT);
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  const editor = await ana.page.locator('[data-testid="document-editor"]').boundingBox();
  const panel = await ana.page.locator('aside').boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(editor!.y + editor!.height);
  await waitForSettledTimeline({ page: ana.page, documentId });
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(EDITED_PHRASE, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(summarizeButton(ana.page)).toBeVisible();
  expect(await ana.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(NARROW_VIEWPORT.width);
});
