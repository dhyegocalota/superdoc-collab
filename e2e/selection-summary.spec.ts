import { SELECTION_SUMMARY_FAILED_MESSAGE } from '../libs/types/src';
import {
  EARLIER_STATE_LABEL,
  RETRY_SUMMARY_LABEL,
  SUMMARY_UP_TO_DATE_MESSAGE,
  TOPICS_GROUPED_LABEL,
} from '../apps/web/src/features/timeline/timeline-copy';
import { insertedBy, insertInParagraph, readEvents, typeInParagraph } from './editor';
import { expect, test } from './fixtures';
import {
  ANA,
  BRUNO,
  BUDGET,
  BUDGET_PARAGRAPH,
  filterBy,
  HIRING,
  HIRING_PARAGRAPH,
  readSelectionCalls,
  summarizeButton,
  summaryCard,
  twoAuthorsInTwoTopics,
  waitForBands,
  waitForSettledTimeline,
} from './timeline';

const SUMMARY_TIMEOUT_MS = 30_000;
const HIRING_PREFIX = 'Hiring:';
const BRUNO_FILTER = `@${BRUNO}`;
const ANA_FILTER = `@${ANA}`;
const WRITER_TEXT = ' and a writer';
const FAILING_TEXT = ' FAIL-SUMMARY';

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
  await expect(summaryCard(ana.page)).not.toContainText(TOPICS_GROUPED_LABEL);
  const sentence = await summaryCard(ana.page).locator('p').first().innerText();
  const callsAfterSummary = await readSelectionCalls(ana.page.request);
  await bruno.page.goto(ana.page.url());
  await expect(summaryCard(bruno.page)).toContainText(sentence, { timeout: SUMMARY_TIMEOUT_MS });
  await summarizeButton(bruno.page).click();
  await expect(summaryCard(bruno.page)).toContainText(SUMMARY_UP_TO_DATE_MESSAGE);
  expect(await readSelectionCalls(bruno.page.request)).toBe(callsAfterSummary);
});

test('an edit outside the filter marks the summary as for an earlier state and enables Summarize', async ({ browser }) => {
  const { ana, bruno, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await filterBy({ page: ana.page, text: ANA_FILTER });
  const before = await readSelectionCalls(ana.page.request);
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(`${ANA} edited`, { timeout: SUMMARY_TIMEOUT_MS });
  await typeInParagraph({ page: bruno.page, paragraphText: HIRING_PREFIX, text: WRITER_TEXT });
  await expect(summaryCard(ana.page)).toContainText(EARLIER_STATE_LABEL, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(summarizeButton(ana.page)).toBeEnabled();
  expect(await readSelectionCalls(ana.page.request)).toBe(before + 1);
});

test('a failed summary explains itself and offers a retry', async ({ browser }) => {
  const { ana, bruno, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await insertInParagraph({ page: bruno.page, paragraphText: HIRING_PREFIX, text: FAILING_TEXT });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await expect
    .poll(async () => insertedBy({ events: await readEvents({ page: ana.page, documentId }), userId: bruno.userId }), {
      timeout: SUMMARY_TIMEOUT_MS,
    })
    .toContain(FAILING_TEXT);
  await waitForSettledTimeline({ page: ana.page, documentId });
  await filterBy({ page: ana.page, text: BRUNO_FILTER });
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(SELECTION_SUMMARY_FAILED_MESSAGE, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(summaryCard(ana.page).getByRole('button', { name: RETRY_SUMMARY_LABEL })).toBeVisible();
});
