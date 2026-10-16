import type { Browser } from '@playwright/test';
import { DEMO_USERS, ShareLinkRole, TimelineSearchParam, TOPICS_UNAVAILABLE_MESSAGE } from '../libs/types/src';
import { bandAriaLabel, FILTER_LABEL, REFRESH_TOPICS_LABEL, removeFilterLabel, RETRY_TOPICS_LABEL, TOP_EDITS_LABEL } from '../apps/web/src/features/timeline/timeline-copy';
import { shareAndAccept, typeInParagraph, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import { bandNamed, bandVolume, BANDS_TIMEOUT_MS, currentAt, pressInChart, readTimeline, ruleX, VERSION_TIMEOUT_MS, waitForBands } from './timeline';

const ANA = DEMO_USERS[0]!.name;
const BRUNO = DEMO_USERS[1]!.name;
const BUDGET = 'Budget';
const HIRING = 'Hiring';
const BUDGET_PARAGRAPH = 'Budget: the plan costs 10.';
const HIRING_PARAGRAPH = 'Hiring: we add two people.';
const FAILING_PARAGRAPH = 'FAIL-TOPICS: the plan costs 10.';
const ANA_TEXT = ' More money';
const BRUNO_TEXT = ' A designer';
const LONG_TYPING_LENGTH = 80;
const LONG_TYPING_DELAY_MS = 100;
const NARROW_VIEWPORT = { width: 375, height: 812 };
const VERSION_REQUEST_PATTERN = /\/versions\/\d+$/;
const FILTER_TIMEOUT_MS = 30_000;

async function twoAuthorsType({ browser, paragraphs }: { browser: Browser; paragraphs: string[] }) {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await Promise.all([
    typeInParagraph({ page: ana.page, paragraphText: paragraphs[0]!.slice(0, 7), text: ANA_TEXT }),
    typeInParagraph({ page: bruno.page, paragraphText: paragraphs[1]!.slice(0, 7), text: BRUNO_TEXT }),
  ]);
  return { ana, bruno, documentId };
}

async function twoAuthorsInTwoTopics({ browser, paragraphs }: { browser: Browser; paragraphs: string[] }) {
  const session = await twoAuthorsType({ browser, paragraphs });
  await session.ana.page.getByRole('button', { name: REFRESH_TOPICS_LABEL }).click();
  return session;
}

async function filterBy({ page, text }: { page: Parameters<typeof waitForBands>[0]['page']; text: string }): Promise<void> {
  await page.getByLabel(FILTER_LABEL).fill(text);
  await page.getByLabel(FILTER_LABEL).press('Enter');
}

function topEdits(page: Parameters<typeof waitForBands>[0]['page']) {
  return page.getByRole('heading', { name: TOP_EDITS_LABEL }).locator('..').getByRole('listitem');
}

test('two authors type in two topics and the bands appear', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await expect(topEdits(ana.page).filter({ hasText: BUDGET })).toContainText(`Edits about ${BUDGET}.`, { timeout: BANDS_TIMEOUT_MS });
  await expect(topEdits(ana.page).filter({ hasText: HIRING }).getByTitle(BRUNO)).toBeVisible();
});

test('filter by username hides the other author', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await filterBy({ page: ana.page, text: '@bruno' });
  await expect(ana.page).toHaveURL(new RegExp(`${TimelineSearchParam.Author}=bruno`));
  await expect(bandNamed({ page: ana.page, name: BUDGET })).toHaveAttribute('aria-label', bandAriaLabel({ name: BUDGET, volume: 0 }), { timeout: FILTER_TIMEOUT_MS });
  await expect(topEdits(ana.page).filter({ hasText: HIRING })).toHaveCount(1);
  await expect(topEdits(ana.page).filter({ hasText: BUDGET })).toHaveCount(0);
});

test('filter by term survives a reload', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await filterBy({ page: ana.page, text: 'designer' });
  await expect(ana.page).toHaveURL(new RegExp(`${TimelineSearchParam.Term}=designer`));
  await expect(bandNamed({ page: ana.page, name: BUDGET })).toHaveAttribute('aria-label', bandAriaLabel({ name: BUDGET, volume: 0 }), { timeout: FILTER_TIMEOUT_MS });
  await ana.page.reload();
  await expect(ana.page.getByRole('button', { name: removeFilterLabel('designer') })).toBeVisible({ timeout: BANDS_TIMEOUT_MS });
  await expect(bandNamed({ page: ana.page, name: BUDGET })).toHaveAttribute('aria-label', bandAriaLabel({ name: BUDGET, volume: 0 }), { timeout: FILTER_TIMEOUT_MS });
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

test('topics unavailable shows author bands', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [FAILING_PARAGRAPH, HIRING_PARAGRAPH] });
  await expect(ana.page.getByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeVisible({ timeout: BANDS_TIMEOUT_MS });
  await waitForBands({ page: ana.page, names: [ANA, BRUNO] });
  await expect(ana.page.getByRole('button', { name: RETRY_TOPICS_LABEL })).toBeVisible();
});

test('keyboard moves the selected bin', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await pressInChart({ page: ana.page, name: BUDGET, keys: ['End'] });
  await expect.poll(() => new URL(ana.page.url()).searchParams.get(TimelineSearchParam.At), { timeout: FILTER_TIMEOUT_MS }).not.toBeNull();
  const lastRule = await ruleX(ana.page);
  const lastAt = new URL(ana.page.url()).searchParams.get(TimelineSearchParam.At);
  const navigations: string[] = [];
  ana.page.on('framenavigated', (frame) => navigations.push(frame.url()));
  await ana.page.keyboard.press('ArrowLeft');
  await expect.poll(() => new URL(ana.page.url()).searchParams.get(TimelineSearchParam.At), { timeout: FILTER_TIMEOUT_MS }).not.toBe(lastAt);
  expect(await ruleX(ana.page)).toBeLessThan(lastRule);
  expect(navigations.filter((url) => url.includes(`${TimelineSearchParam.At}=`))).toHaveLength(1);
});

test('two quick arrow presses land on the second bin with one navigation', async ({ browser }) => {
  const { ana, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  const { bins } = await readTimeline({ page: ana.page, documentId });
  await pressInChart({ page: ana.page, name: BUDGET, keys: ['End'] });
  await expect.poll(() => currentAt(ana.page), { timeout: VERSION_TIMEOUT_MS }).toBe(bins.at(-1)!.start);
  const navigations: string[] = [];
  ana.page.on('framenavigated', (frame) => navigations.push(frame.url()));
  const versionRequests: string[] = [];
  ana.page.on('request', (request) => {
    if (VERSION_REQUEST_PATTERN.test(new URL(request.url()).pathname)) versionRequests.push(request.url());
  });
  await ana.page.keyboard.press('ArrowLeft');
  await ana.page.keyboard.press('ArrowLeft');
  const target = bins.at(-3)!.start;
  await expect.poll(() => currentAt(ana.page), { timeout: VERSION_TIMEOUT_MS }).toBe(target);
  expect(navigations.filter((url) => url.includes(`${TimelineSearchParam.At}=`))).toHaveLength(1);
  expect(versionRequests.length).toBeLessThanOrEqual(1);
});

test('narrow viewport stacks the panel', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await ana.page.setViewportSize(NARROW_VIEWPORT);
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  const editor = await ana.page.locator('[data-testid="document-editor"]').boundingBox();
  const panel = await ana.page.locator('aside').boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(editor!.y + editor!.height);
  expect(await ana.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(NARROW_VIEWPORT.width);
});
