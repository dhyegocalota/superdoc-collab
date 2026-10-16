import type { Browser, Page } from '@playwright/test';
import { DEMO_USERS, DOCUMENT_UNAVAILABLE_MESSAGE, ShareLinkRole, versionViewPagePath } from '../libs/types/src';
import { BACK_TO_LIVE_LABEL, REFRESH_TOPICS_LABEL } from '../apps/web/src/features/timeline/timeline-copy';
import { acceptShareLink, readEvents, shareAndAccept, typeInParagraph, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import {
  countViewerHighlights,
  currentAt,
  HIGHLIGHT_CLASS,
  pressInChart,
  readLiveText,
  readVersionText,
  readViewerText,
  shownVersionSequence,
  VERSION_TIMEOUT_MS,
  versionBanner,
  viewerFrame,
  waitForBands,
} from './timeline';

const PARAGRAPHS = ['Budget: the plan costs 10.', 'Hiring: we add two people.'];
const EDIT_TEXT = ' More money';
const LIVE_TEXT = ' live';
const AGAIN_TEXT = ' again';
const VERSIONS_SEGMENT = '/versions/';
const BAND_NAME = 'Budget';
const READ_ONLY_ATTEMPT = ' reader typed this';

async function ownerWithEdit(browser: Browser) {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: EDIT_TEXT });
  await waitForBands({ page: ana.page, names: [DEMO_USERS[0]!.name] });
  await ana.page.getByRole('button', { name: REFRESH_TOPICS_LABEL }).click();
  await waitForBands({ page: ana.page, names: [BAND_NAME] });
  return { ana, documentId };
}

async function openEditBin(page: Page): Promise<void> {
  await pressInChart({ page, name: BAND_NAME, keys: ['End', 'ArrowLeft'] });
  await expect.poll(() => currentAt(page), { timeout: VERSION_TIMEOUT_MS }).not.toBeNull();
  await expect(versionBanner(page)).toHaveAttribute('data-sequence', /\d+/, { timeout: VERSION_TIMEOUT_MS });
}

async function expectViewerMatchesServer({ page, documentId }: { page: Page; documentId: string }): Promise<string> {
  const sequence = await shownVersionSequence(page);
  const serverText = await readVersionText({ page, documentId, sequence });
  await expect.poll(() => readViewerText(page), { timeout: VERSION_TIMEOUT_MS }).toBe(serverText);
  return serverText;
}

test('the first bin opens the document as uploaded and Back to live returns', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  await pressInChart({ page: ana.page, name: BAND_NAME, keys: ['Home'] });
  await expect(versionBanner(ana.page)).toHaveAttribute('data-sequence', /\d+/, { timeout: VERSION_TIMEOUT_MS });
  const serverText = await expectViewerMatchesServer({ page: ana.page, documentId });
  expect(serverText).not.toContain(EDIT_TEXT.trim());
  await viewerFrame(ana.page).locator('.superdoc-text-run').first().click();
  await ana.page.keyboard.type(READ_ONLY_ATTEMPT);
  expect(await readViewerText(ana.page)).toBe(serverText);
  await ana.page.getByRole('button', { name: BACK_TO_LIVE_LABEL }).click();
  expect(currentAt(ana.page)).toBeNull();
  await expect.poll(() => readLiveText(ana.page)).toContain(EDIT_TEXT);
  await typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: AGAIN_TEXT });
  await expect.poll(() => readLiveText(ana.page)).toContain(AGAIN_TEXT);
});

test('the edit bin shows the edit and lists it', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  await openEditBin(ana.page);
  const serverText = await expectViewerMatchesServer({ page: ana.page, documentId });
  expect(serverText).toContain(EDIT_TEXT.trim());
  await expect(ana.page.getByRole('listitem').filter({ hasText: EDIT_TEXT.trim() })).toBeVisible();
  await expect(ana.page.getByRole('listitem').filter({ hasText: DEMO_USERS[0]!.name })).toBeVisible();
});

test('a shared at link opens the same version for another member', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  await openEditBin(ana.page);
  const anaText = await expectViewerMatchesServer({ page: ana.page, documentId });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await bruno.page.goto(ana.page.url());
  await expect(versionBanner(bruno.page)).toHaveAttribute('data-sequence', String(await shownVersionSequence(ana.page)), { timeout: VERSION_TIMEOUT_MS });
  await expect.poll(() => readViewerText(bruno.page), { timeout: VERSION_TIMEOUT_MS }).toBe(anaText);
  expect(await versionBanner(bruno.page).textContent()).toBe(await versionBanner(ana.page).textContent());
});

test('a non-member opening an at link sees the document is unavailable', async ({ browser }) => {
  const { ana } = await ownerWithEdit(browser);
  await openEditBin(ana.page);
  const dani = await signedInContext({ browser, user: DEMO_USERS[3]! });
  const versionRequests: string[] = [];
  dani.page.on('request', (request) => {
    if (request.url().includes(VERSIONS_SEGMENT)) versionRequests.push(request.url());
  });
  await dani.page.goto(ana.page.url());
  await expect(dani.page.getByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeVisible({ timeout: VERSION_TIMEOUT_MS });
  expect(versionRequests).toEqual([]);
});

test('Browser Back from a version returns to live', async ({ browser }) => {
  const { ana } = await ownerWithEdit(browser);
  await pressInChart({ page: ana.page, name: BAND_NAME, keys: ['End'] });
  await expect.poll(() => currentAt(ana.page), { timeout: VERSION_TIMEOUT_MS }).not.toBeNull();
  await ana.page.goBack();
  await expect.poll(() => currentAt(ana.page)).toBeNull();
  await expect(versionBanner(ana.page)).toHaveCount(0);
  await expect.poll(() => readLiveText(ana.page)).toContain(EDIT_TEXT);
});

test('highlights stay local to one viewer', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  await openEditBin(ana.page);
  await expect.poll(() => countViewerHighlights(viewerFrame(ana.page)), { timeout: VERSION_TIMEOUT_MS }).toBeGreaterThanOrEqual(1);
  const sequence = await shownVersionSequence(ana.page);
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  const before = (await readEvents({ page: ana.page, documentId })).length;
  await bruno.page.goto(versionViewPagePath({ documentId, sequence }));
  await expect.poll(() => bruno.page.locator('.superdoc-text-run').count(), { timeout: VERSION_TIMEOUT_MS }).toBeGreaterThan(0);
  expect(await bruno.page.locator(`.${HIGHLIGHT_CLASS}`).count()).toBe(0);
  expect((await readEvents({ page: ana.page, documentId })).length).toBe(before);
});

test('the live editor keeps working while the viewer is open', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await openEditBin(ana.page);
  const viewedText = await expectViewerMatchesServer({ page: ana.page, documentId });
  await typeInParagraph({ page: bruno.page, paragraphText: 'Hiring:', text: LIVE_TEXT });
  await expect.poll(() => readLiveText(ana.page), { timeout: VERSION_TIMEOUT_MS }).toContain(LIVE_TEXT);
  expect(await readViewerText(ana.page)).toBe(viewedText);
  await ana.page.getByRole('button', { name: BACK_TO_LIVE_LABEL }).click();
  await typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: AGAIN_TEXT });
  await expect.poll(() => readLiveText(bruno.page), { timeout: VERSION_TIMEOUT_MS }).toContain(AGAIN_TEXT);
});

test('a reader opens the timeline and a version but cannot refresh or edit it', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  const caio = await signedInContext({ browser, user: DEMO_USERS[2]! });
  await acceptShareLink({ page: caio.page, documentId, role: ShareLinkRole.Read, owner: ana.page });
  await waitForBands({ page: caio.page, names: [BAND_NAME] });
  await expect(caio.page.getByRole('button', { name: 'Refresh topics' })).toHaveCount(0);
  await expect(caio.page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await openEditBin(caio.page);
  const serverText = await expectViewerMatchesServer({ page: caio.page, documentId });
  await viewerFrame(caio.page).locator('.superdoc-text-run').first().click();
  await caio.page.keyboard.type(READ_ONLY_ATTEMPT);
  expect(await readViewerText(caio.page)).toBe(serverText);
  expect(await readVersionText({ page: caio.page, documentId, sequence: await shownVersionSequence(caio.page) })).toBe(serverText);
});
