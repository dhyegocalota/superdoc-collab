import { SELECTION_SUMMARY_COOLDOWN_MS, SELECTION_SUMMARY_FAILED_MESSAGE, SELECTION_SUMMARY_TOO_SOON_MESSAGE, DEMO_USERS, SECOND_MS, ShareLinkRole } from '../libs/types/src';
import { EARLIER_STATE_LABEL, NO_EDITS_TO_SUMMARIZE_MESSAGE, RETRY_SUMMARY_LABEL, SUMMARIZE_EDITS_LABEL, SUMMARY_UP_TO_DATE_MESSAGE } from '../apps/web/src/features/timeline/timeline-copy';
import { shareAndAccept, typeInParagraph } from './editor';
import { expect, signedInContext, test } from './fixtures';
import { ANA, BRUNO, BUDGET, BUDGET_PARAGRAPH, filterBy, HIRING, HIRING_PARAGRAPH, readSelectionCalls, summarizeButton, summaryCard, twoAuthorsInTwoTopics, waitForBands, waitForSettledTimeline } from './timeline';

const CAIO = DEMO_USERS[2]!;
const SUMMARY_TIMEOUT_MS = 30_000;
const COOLDOWN_PASS_TIMEOUT_MS = SELECTION_SUMMARY_COOLDOWN_MS + 30_000;
const PROBE_TIMEOUT_MS = 5_000;
const NARROW_VIEWPORT = { width: 375, height: 812 };
const HIRING_PREFIX = 'Hiring:';
const BRUNO_FILTER = `@${BRUNO}`;
const ANA_FILTER = `@${ANA}`;
const WRITER_TEXT = ' and a writer';
const FAILING_TEXT = ' FAIL-SUMMARY';
const NOTHING_FILTER = 'zzz-nothing';
const EDITED_PHRASE = 'edited';
const RETRY_SECONDS_PATTERN = /Try again in (\d+) s\./;

test('summarizing a filter by person names only that person', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await filterBy({ page: ana.page, text: BRUNO_FILTER });
  const before = await readSelectionCalls(ana.page.request);
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(`${BRUNO} edited`, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(summaryCard(ana.page)).not.toContainText(ANA);
  await expect(summaryCard(ana.page).getByTitle(BRUNO)).toBeVisible();
  expect(await readSelectionCalls(ana.page.request)).toBe(before + 1);
});

test('another member with the same filter reads the cached summary without a model call', async ({ browser }) => {
  const { ana, bruno, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await filterBy({ page: ana.page, text: BRUNO_FILTER });
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(`${BRUNO} edited`, { timeout: SUMMARY_TIMEOUT_MS });
  const sentence = await summaryCard(ana.page).locator('p').first().innerText();
  const callsAfterSummary = await readSelectionCalls(ana.page.request);
  await bruno.page.goto(ana.page.url());
  await expect(summaryCard(bruno.page)).toContainText(sentence, { timeout: SUMMARY_TIMEOUT_MS });
  expect(await readSelectionCalls(bruno.page.request)).toBe(callsAfterSummary);
  await expect(summarizeButton(bruno.page)).toBeDisabled();
  await expect(summarizeButton(bruno.page)).toHaveAttribute('title', SUMMARY_UP_TO_DATE_MESSAGE);
});

test('a new edit marks the summary as for an earlier state and Summarize refreshes it after the cooldown', async ({ browser }) => {
  const { ana, bruno, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await filterBy({ page: ana.page, text: BRUNO_FILTER });
  const before = await readSelectionCalls(ana.page.request);
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(`${BRUNO} edited`, { timeout: SUMMARY_TIMEOUT_MS });
  await typeInParagraph({ page: bruno.page, paragraphText: HIRING_PREFIX, text: WRITER_TEXT });
  await expect(summaryCard(ana.page)).toContainText(EARLIER_STATE_LABEL, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(async () => {
    await summarizeButton(ana.page).click({ timeout: PROBE_TIMEOUT_MS });
    await expect(summaryCard(ana.page)).not.toContainText(EARLIER_STATE_LABEL, { timeout: PROBE_TIMEOUT_MS });
  }).toPass({ timeout: COOLDOWN_PASS_TIMEOUT_MS });
  expect(await readSelectionCalls(ana.page.request)).toBe(before + 2);
});

test('an edit outside the filter also marks the summary as for an earlier state', async ({ browser }) => {
  const { ana, bruno, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: bruno.page, names: [BUDGET, HIRING] });
  await waitForSettledTimeline({ page: bruno.page, documentId });
  await filterBy({ page: bruno.page, text: ANA_FILTER });
  await summarizeButton(bruno.page).click();
  await expect(summaryCard(bruno.page)).toContainText(`${ANA} edited`, { timeout: SUMMARY_TIMEOUT_MS });
  await typeInParagraph({ page: bruno.page, paragraphText: HIRING_PREFIX, text: WRITER_TEXT });
  await expect(summaryCard(bruno.page)).toContainText(EARLIER_STATE_LABEL, { timeout: SUMMARY_TIMEOUT_MS });
});

test('a second filter inside the cooldown shows when to retry', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await filterBy({ page: ana.page, text: BRUNO_FILTER });
  const before = await readSelectionCalls(ana.page.request);
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(`${BRUNO} edited`, { timeout: SUMMARY_TIMEOUT_MS });
  await filterBy({ page: ana.page, text: ANA_FILTER });
  await summarizeButton(ana.page).click();
  const alert = summaryCard(ana.page).getByRole('alert');
  await expect(alert).toContainText(SELECTION_SUMMARY_TOO_SOON_MESSAGE);
  const seconds = Number(RETRY_SECONDS_PATTERN.exec(await alert.innerText())![1]);
  expect(seconds).toBeGreaterThanOrEqual(1);
  expect(seconds).toBeLessThanOrEqual(SELECTION_SUMMARY_COOLDOWN_MS / SECOND_MS);
  expect(await readSelectionCalls(ana.page.request)).toBe(before + 1);
});

test('a reader sees the summary but no Summarize button', async ({ browser }) => {
  const { ana, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  const caio = await signedInContext({ browser, user: CAIO });
  await shareAndAccept({ owner: ana.page, member: caio.page, documentId, role: ShareLinkRole.Read });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(EDITED_PHRASE, { timeout: SUMMARY_TIMEOUT_MS });
  const sentence = await summaryCard(ana.page).locator('p').first().innerText();
  await caio.page.reload();
  await waitForBands({ page: caio.page, names: [BUDGET, HIRING] });
  await expect(summaryCard(caio.page)).toContainText(sentence, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(caio.page.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toHaveCount(0);
  await expect(caio.page.getByRole('button', { name: RETRY_SUMMARY_LABEL })).toHaveCount(0);
});

test('a failed summary explains itself and offers a retry', async ({ browser }) => {
  const { ana, bruno, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await typeInParagraph({ page: bruno.page, paragraphText: HIRING_PREFIX, text: FAILING_TEXT });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await filterBy({ page: ana.page, text: BRUNO_FILTER });
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(SELECTION_SUMMARY_FAILED_MESSAGE, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(summaryCard(ana.page).getByRole('button', { name: RETRY_SUMMARY_LABEL })).toBeVisible();
});

test('an empty selection disables Summarize with a reason', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await filterBy({ page: ana.page, text: NOTHING_FILTER });
  await expect(summarizeButton(ana.page)).toBeDisabled();
  await expect(summarizeButton(ana.page)).toHaveAttribute('title', NO_EDITS_TO_SUMMARIZE_MESSAGE);
  await expect(summaryCard(ana.page)).toHaveCount(0);
});

test('the summary fits a 375 px screen', async ({ browser }) => {
  const { ana, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await ana.page.setViewportSize(NARROW_VIEWPORT);
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(EDITED_PHRASE, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(summarizeButton(ana.page)).toBeVisible();
  const scrollWidth = await ana.page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(NARROW_VIEWPORT.width);
});
