import type { Browser, Page } from '@playwright/test';
import { DEMO_USERS, ShareLinkRole, TOPICS_UNAVAILABLE_MESSAGE, versionViewPagePath } from '../libs/types/src';
import { EDITOR_EXIT_LABEL } from '../apps/web/src/features/editor/editor-copy';
import {
  BACK_TO_LIVE_LABEL,
  FILTER_LABEL,
  RETRY_TOPICS_LABEL,
  SUMMARIZE_EDITS_LABEL,
  VERSION_FRAME_TITLE,
} from '../apps/web/src/features/timeline/timeline-copy';
import {
  acceptShareLink,
  EDITOR_INPUT_SELECTOR,
  editorText,
  readEvents,
  shareAndAccept,
  TEXT_RUN_SELECTOR,
  toolbarRow,
  typeInParagraph,
  uploadSeed,
} from './editor';
import { expect, signedInContext, test } from './fixtures';
import {
  countViewerHighlights,
  currentAt,
  expectStableFor,
  HIGHLIGHT_CLASS,
  pressInChart,
  readLiveText,
  readTimeline,
  readVersionMarks,
  readVersionText,
  readViewerText,
  shownVersionSequence,
  summarizeButton,
  VERSION_TIMEOUT_MS,
  versionBanner,
  viewerFrame,
  waitForBands,
  waitForProjection,
  waitForSettledTimeline,
} from './timeline';

const PARAGRAPHS = ['Budget: the plan costs 10.', 'Hiring: we add two people.'];
const EDIT_TEXT = ' More money';
const LIVE_TEXT = ' live';
const AGAIN_TEXT = ' again';
const BAND_NAME = 'Budget';
const INSERTED_SNIPPET_SELECTOR = 'ins';
const FAILING_PARAGRAPHS = ['FAIL-TOPICS: the plan costs 10.', 'Hiring: we add two people.'];
const STABLE_WINDOW_MS = 4_500;
const ANA = DEMO_USERS[0]!.name;
const READ_ONLY_ATTEMPT = ' reader typed this';
const DRAFT_TEXT = 'bud';

async function ownerWithEdit(browser: Browser) {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: EDIT_TEXT });
  await waitForBands({ page: ana.page, names: [BAND_NAME] });
  return { ana, documentId };
}

async function openEditBin({ page, documentId }: { page: Page; documentId: string }): Promise<void> {
  await waitForSettledTimeline({ page, documentId });
  const { bins } = await readTimeline({ page, documentId });
  const lastFilledIndex = bins.findLastIndex((bin) => Object.keys(bin.byBand).length > 0);
  const stepsBack = bins.length - 1 - lastFilledIndex;
  await pressInChart({ page, name: BAND_NAME, keys: ['End', ...Array.from({ length: stepsBack }, () => 'ArrowLeft')] });
  await expect.poll(() => currentAt(page), { timeout: VERSION_TIMEOUT_MS }).not.toBeNull();
  await expect(versionBanner(page)).toHaveAttribute('data-sequence', /\d+/, { timeout: VERSION_TIMEOUT_MS });
}

async function expectViewerMatchesServer({ page, documentId }: { page: Page; documentId: string }): Promise<string> {
  const sequence = await shownVersionSequence(page);
  const serverText = await readVersionText({ page, documentId, sequence });
  await expect.poll(() => readViewerText(page), { timeout: VERSION_TIMEOUT_MS }).toBe(serverText);
  return serverText;
}

test('the first bin opens a version of its minute and Back to live returns', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  await pressInChart({ page: ana.page, name: BAND_NAME, keys: ['Home'] });
  await expect(versionBanner(ana.page)).toHaveAttribute('data-sequence', /\d+/, { timeout: VERSION_TIMEOUT_MS });
  const serverText = await expectViewerMatchesServer({ page: ana.page, documentId });
  expect(serverText).toContain(PARAGRAPHS[0]!);
  await viewerFrame(ana.page).locator(TEXT_RUN_SELECTOR).first().click();
  await ana.page.keyboard.type(READ_ONLY_ATTEMPT);
  expect(await readViewerText(ana.page)).toBe(serverText);
  await ana.page.getByRole('button', { name: BACK_TO_LIVE_LABEL }).click();
  expect(currentAt(ana.page)).toBeNull();
  await expect.poll(() => readLiveText(ana.page)).toContain(EDIT_TEXT);
  await typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: AGAIN_TEXT });
  await expect.poll(() => readLiveText(ana.page)).toContain(AGAIN_TEXT);
});

test('the edit bin shows the edit, lists it and Browser Back returns to live', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  await openEditBin({ page: ana.page, documentId });
  const serverText = await expectViewerMatchesServer({ page: ana.page, documentId });
  expect(serverText).toContain(EDIT_TEXT.trim());
  const binEdits = ana.page.locator('aside section').getByRole('listitem');
  await expect(binEdits.filter({ hasText: ANA })).toBeVisible();
  await expect(binEdits.filter({ has: ana.page.locator(INSERTED_SNIPPET_SELECTOR) })).toBeVisible();
  await ana.page.goBack();
  await expect.poll(() => currentAt(ana.page)).toBeNull();
  await expect(versionBanner(ana.page)).toHaveCount(0);
  await expect.poll(() => readLiveText(ana.page)).toContain(EDIT_TEXT);
});

test('a shared at link opens the same version for another member', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  await openEditBin({ page: ana.page, documentId });
  await expectViewerMatchesServer({ page: ana.page, documentId });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await ana.page.reload();
  await expect(versionBanner(ana.page)).toHaveAttribute('data-sequence', /\d+/, { timeout: VERSION_TIMEOUT_MS });
  const settledText = await expectViewerMatchesServer({ page: ana.page, documentId });
  await bruno.page.goto(ana.page.url());
  await expect(versionBanner(bruno.page)).toHaveAttribute('data-sequence', String(await shownVersionSequence(ana.page)), {
    timeout: VERSION_TIMEOUT_MS,
  });
  await expect.poll(() => readViewerText(bruno.page), { timeout: VERSION_TIMEOUT_MS }).toBe(settledText);
  expect(await versionBanner(bruno.page).textContent()).toBe(await versionBanner(ana.page).textContent());
});

test('highlights stay local to one viewer', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await waitForProjection({ page: ana.page, documentId });
  const eventsBefore = (await readEvents({ page: ana.page, documentId })).length;
  const marksBefore = await readVersionMarks({ page: ana.page, documentId });
  expect(marksBefore.marks.length).toBeGreaterThan(0);
  await openEditBin({ page: ana.page, documentId });
  await expect.poll(() => countViewerHighlights(viewerFrame(ana.page)), { timeout: VERSION_TIMEOUT_MS }).toBeGreaterThanOrEqual(1);
  const sequence = await shownVersionSequence(ana.page);
  await bruno.page.goto(versionViewPagePath({ documentId, sequence }));
  await expect.poll(() => bruno.page.locator(TEXT_RUN_SELECTOR).count(), { timeout: VERSION_TIMEOUT_MS }).toBeGreaterThan(0);
  expect(await bruno.page.locator(`.${HIGHLIGHT_CLASS}`).count()).toBe(0);
  await waitForProjection({ page: ana.page, documentId });
  expect((await readEvents({ page: ana.page, documentId })).length).toBe(eventsBefore);
  expect(await readVersionMarks({ page: ana.page, documentId })).toEqual(marksBefore);
});

test('the live editor keeps working while the viewer is open', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await openEditBin({ page: ana.page, documentId });
  const viewedText = await expectViewerMatchesServer({ page: ana.page, documentId });
  await typeInParagraph({ page: bruno.page, paragraphText: 'Hiring:', text: LIVE_TEXT });
  await expect.poll(() => readLiveText(ana.page), { timeout: VERSION_TIMEOUT_MS }).toContain(LIVE_TEXT);
  await expectStableFor({ read: () => readViewerText(ana.page), expected: viewedText, durationMs: STABLE_WINDOW_MS });
  await ana.page.getByRole('button', { name: BACK_TO_LIVE_LABEL }).click();
  await typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: AGAIN_TEXT });
  await expect.poll(() => readLiveText(bruno.page), { timeout: VERSION_TIMEOUT_MS }).toContain(AGAIN_TEXT);
});

test('a reader opens the timeline and a version, cannot summarize, and the room drops their edits', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  const caio = await signedInContext({ browser, user: DEMO_USERS[2]! });
  await acceptShareLink({ page: caio.page, documentId, role: ShareLinkRole.Read, owner: ana.page });
  await waitForBands({ page: caio.page, names: [BAND_NAME] });
  await expect(toolbarRow(caio.page)).toHaveCount(0);
  await expect(caio.page.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toHaveCount(0);
  await editorText(caio.page).first().click();
  await caio.page.keyboard.press('Escape');
  await expect.poll(() => caio.page.evaluate(() => document.activeElement?.textContent)).toBe(EDITOR_EXIT_LABEL);
  await openEditBin({ page: caio.page, documentId });
  const serverText = await expectViewerMatchesServer({ page: caio.page, documentId });
  await waitForProjection({ page: ana.page, documentId });
  const eventsBefore = (await readEvents({ page: ana.page, documentId })).length;
  const liveBefore = await readLiveText(ana.page);
  await viewerFrame(caio.page).locator(TEXT_RUN_SELECTOR).first().click();
  await caio.page.keyboard.type(READ_ONLY_ATTEMPT);
  expect(await readViewerText(caio.page)).toBe(serverText);
  await waitForProjection({ page: ana.page, documentId });
  expect((await readEvents({ page: ana.page, documentId })).length).toBe(eventsBefore);
  expect(await readLiveText(ana.page)).toBe(liveBefore);
});

test('the toolbar container is inert while a version shows and Summarize stays live', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  const inertToolbar = toolbarRow(ana.page).locator('[inert]');
  await expect(inertToolbar).toHaveCount(0);
  await openEditBin({ page: ana.page, documentId });
  await expect(inertToolbar).toHaveCount(1);
  await expect(inertToolbar.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toHaveCount(0);
  await expect(summarizeButton(ana.page)).toBeEnabled();
  await ana.page.getByRole('button', { name: BACK_TO_LIVE_LABEL }).click();
  await expect(inertToolbar).toHaveCount(0);
});

test('failed topics fall back to author bands and only the owner gets Retry', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: FAILING_PARAGRAPHS });
  await typeInParagraph({ page: ana.page, paragraphText: 'FAIL-TOPICS:', text: EDIT_TEXT });
  await expect(ana.page.getByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeVisible({ timeout: VERSION_TIMEOUT_MS });
  await waitForBands({ page: ana.page, names: [ANA] });
  await expect(ana.page.getByRole('button', { name: RETRY_TOPICS_LABEL })).toBeVisible();
  const caio = await signedInContext({ browser, user: DEMO_USERS[2]! });
  await acceptShareLink({ page: caio.page, documentId, role: ShareLinkRole.Read, owner: ana.page });
  await expect(caio.page.getByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeVisible({ timeout: VERSION_TIMEOUT_MS });
  await expect(caio.page.getByRole('button', { name: RETRY_TOPICS_LABEL })).toHaveCount(0);
});

test('Escape clears a filled filter box first and leaves the version from inside the frame', async ({ browser }) => {
  const { ana } = await ownerWithEdit(browser);
  await pressInChart({ page: ana.page, name: BAND_NAME, keys: ['Home'] });
  await expect(versionBanner(ana.page)).toHaveAttribute('data-sequence', /\d+/, { timeout: VERSION_TIMEOUT_MS });
  const at = currentAt(ana.page);
  const filter = ana.page.getByRole('textbox', { name: FILTER_LABEL });
  await filter.fill(DRAFT_TEXT);
  await ana.page.keyboard.press('Escape');
  await expect(filter).toHaveValue('');
  expect(currentAt(ana.page)).toBe(at);
  await viewerFrame(ana.page).locator(TEXT_RUN_SELECTOR).first().click();
  await ana.page.keyboard.press('Escape');
  await expect.poll(() => currentAt(ana.page)).toBeNull();
  await expect(ana.page.getByTitle(VERSION_FRAME_TITLE)).toHaveCount(0);
});

test('Escape in the live editor moves focus past it and Tab reaches the timeline', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await editorText(ana.page).first().click();
  await expect
    .poll(() => ana.page.evaluate((selector) => document.activeElement?.matches(selector) === true, EDITOR_INPUT_SELECTOR))
    .toBe(true);
  await ana.page.keyboard.press('Escape');
  await expect.poll(() => ana.page.evaluate(() => document.activeElement?.textContent)).toBe(EDITOR_EXIT_LABEL);
  await ana.page.keyboard.press('Tab');
  await expect.poll(() => ana.page.evaluate(() => document.activeElement?.closest('aside') !== null)).toBe(true);
});
