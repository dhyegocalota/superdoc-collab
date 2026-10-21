import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { documentPagePath, publicApiPath, publicPagePath, HttpStatus, DEMO_USERS } from '../libs/types/src';
import { SHARE_LABEL } from '../apps/web/src/features/editor/editor-copy';
import {
  PUBLIC_LINK_ADDRESS_LABEL,
  PUBLIC_LINK_SWITCH_LABEL,
  PUBLIC_UNAVAILABLE_MESSAGE,
  PUBLIC_VIEW_ONLY_LABEL,
} from '../apps/web/src/features/sharing/public-copy';
import { SUMMARIZE_EDITS_LABEL } from '../apps/web/src/features/timeline/timeline-copy';
import { EDITOR_READY_TIMEOUT_MS, editorText, insertInParagraph, liveEditorText, readEditorText, uploadSeed } from './editor';
import { expect, openedContext, signedInContext, test } from './fixtures';
import {
  ANA,
  BUDGET,
  BUDGET_PARAGRAPH,
  HIRING,
  HIRING_PARAGRAPH,
  summarizeButton,
  summaryCard,
  waitForBands,
  waitForSettledTimeline,
} from './timeline';

const PARAGRAPHS = ['Public paragraph from Ana.'];
const LIVE_TEXT = ' added while watched';
const INTRUDER_TEXT = 'intruder';
const SUMMARY_TIMEOUT_MS = 30_000;
const SWITCH_TIMEOUT_MS = 20_000;

function switchControl(page: Page) {
  return page.getByRole('switch', { name: PUBLIC_LINK_SWITCH_LABEL });
}

async function setPublic({ page, isPublic }: { page: Page; isPublic: boolean }): Promise<string> {
  await page.getByRole('button', { name: SHARE_LABEL }).click();
  const expected = String(isPublic);
  if ((await switchControl(page).getAttribute('aria-checked')) !== expected) await switchControl(page).click();
  await expect(switchControl(page)).toHaveAttribute('aria-checked', expected);
  const address = isPublic ? await page.getByLabel(PUBLIC_LINK_ADDRESS_LABEL).inputValue() : '';
  await page.keyboard.press('Escape');
  return address;
}

test('an anonymous reader sees the text live and cannot type', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  const address = await setPublic({ page: ana.page, isPublic: true });
  const anonymous = await openedContext({ browser });
  await anonymous.page.goto(address);
  await expect(anonymous.page.getByText(PUBLIC_VIEW_ONLY_LABEL)).toBeVisible();
  await expect(liveEditorText(anonymous.page).filter({ hasText: PARAGRAPHS[0]! }).first()).toBeVisible({
    timeout: EDITOR_READY_TIMEOUT_MS,
  });
  await insertInParagraph({ page: ana.page, paragraphText: PARAGRAPHS[0]!, text: LIVE_TEXT });
  await expect(editorText(anonymous.page).filter({ hasText: LIVE_TEXT.trim() }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await editorText(anonymous.page).first().click();
  await anonymous.page.keyboard.type(INTRUDER_TEXT);
  await expect(editorText(anonymous.page).filter({ hasText: INTRUDER_TEXT })).toHaveCount(0);
  await expect.poll(async () => (await readEditorText(ana.page)).includes(INTRUDER_TEXT)).toBe(false);
});

test('the anonymous reader sees the latest stored summary and cannot ask for another', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await insertInParagraph({ page: ana.page, paragraphText: BUDGET_PARAGRAPH.slice(0, 7), text: ' More money' });
  await insertInParagraph({ page: ana.page, paragraphText: HIRING_PARAGRAPH.slice(0, 7), text: ' and a writer' });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(`${ANA} edited`, { timeout: SUMMARY_TIMEOUT_MS });
  const sentence = await summaryCard(ana.page).locator('p').first().innerText();
  const address = await setPublic({ page: ana.page, isPublic: true });
  const anonymous = await openedContext({ browser });
  await anonymous.page.goto(address);
  await expect(summaryCard(anonymous.page)).toContainText(sentence, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(anonymous.page.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toHaveCount(0);
  const refusal = await anonymous.page.request.get(`/api/documents/${documentId}/timeline`);
  expect(refusal.status()).toBe(HttpStatus.Unauthorized);
});

test('a document that was never public and a random id look the same', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  const anonymous = await openedContext({ browser });
  const answers = await Promise.all(
    [documentId, randomUUID()].map(async (id) => {
      const response = await anonymous.page.request.get(publicApiPath(id));
      return [response.status(), await response.text()];
    }),
  );
  expect(answers[0]).toEqual([HttpStatus.NotFound, expect.any(String)]);
  expect(answers[1]).toEqual(answers[0]);
  await anonymous.page.goto(publicPagePath(documentId));
  await expect(anonymous.page.getByText(PUBLIC_UNAVAILABLE_MESSAGE)).toBeVisible();
});

test('turning the link off sends the anonymous reader to the not available page', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  const address = await setPublic({ page: ana.page, isPublic: true });
  const anonymous = await openedContext({ browser });
  await anonymous.page.goto(address);
  await expect(liveEditorText(anonymous.page).filter({ hasText: PARAGRAPHS[0]! }).first()).toBeVisible({
    timeout: EDITOR_READY_TIMEOUT_MS,
  });
  await setPublic({ page: ana.page, isPublic: false });
  await expect(anonymous.page.getByText(PUBLIC_UNAVAILABLE_MESSAGE)).toBeVisible({ timeout: SWITCH_TIMEOUT_MS });
});

test('a member who opens the public link lands on the document', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  const address = await setPublic({ page: ana.page, isPublic: true });
  await ana.page.goto(address);
  await expect(ana.page).toHaveURL(documentPagePath(documentId));
});

test('a signed-in person who is not a member reads under their real name', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  const address = await setPublic({ page: ana.page, isPublic: true });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  await bruno.page.goto(address);
  await expect(bruno.page.getByText(PUBLIC_VIEW_ONLY_LABEL)).toBeVisible();
  await expect(bruno.page.getByText(DEMO_USERS[1]!.name)).toBeVisible();
});
