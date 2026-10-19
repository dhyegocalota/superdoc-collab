import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import {
  ApiPath,
  AppRoute,
  DEMO_USERS,
  DOCUMENT_UNAVAILABLE_MESSAGE,
  DocumentRole,
  DOCX_MIME_TYPE,
  HttpMethod,
  INVALID_SHARE_LINK_MESSAGE,
  READ_ONLY_BADGE_LABEL,
  ShareLinkRole,
  THUMBNAIL_CAPTURE_DELAY_MS,
  THUMBNAIL_UPLOADS_ATTRIBUTE,
  THUMBNAIL_WIDTH_PX,
  documentApiPath,
  documentPagePath,
  type DocumentSummary,
} from '../libs/types/src';
import {
  acceptShareLink,
  documentIdOf,
  downloadButton,
  EDITOR_READY_TIMEOUT_MS,
  editorText,
  focusEditorAtEnd,
  readEditorText,
  readEvents,
  readShareLinks,
  shareAndAccept,
  titleButton,
  typeInParagraph,
  uploadSeed,
  insertedBy,
} from './editor';
import {
  CARDS_VIEW_LABEL,
  DROP_OVERLAY_LABEL,
  DROP_ZONE_LABEL,
  EMPTY_STATE_HEADING,
  NEW_DOCUMENT_LABEL,
  ONE_FILE_AT_A_TIME_MESSAGE,
  ROLE_LABELS,
  SHARED_HEADING,
  TABLE_VIEW_LABEL,
  UPLOAD_LABEL,
} from '../apps/web/src/features/documents/documents-copy';
import { DELETE_CONFIRM_LABEL, DELETE_LABEL, MORE_ACTIONS_LABEL, TITLE_LABEL } from '../apps/web/src/features/editor/editor-copy';
import { PREPARING_DOCUMENT_MESSAGE } from '../apps/web/src/features/editor/waiting-copy';
import {
  acceptInvite,
  expect,
  expectSignedInAs,
  generateInvite,
  signedInAdmin,
  signedInContext,
  test,
  uniqueEmail,
  type OpenedContext,
} from './fixtures';

const PARAGRAPHS = ['Paragraph owned by ana.', 'Paragraph owned by bruno.'];
const OWNER_PARAGRAPH = 'owned by ana';
const MINE_MARKER = ' <MINE>';
const AFTER_MARKER = ' <AFTER>';
const READER_TEXT = 'READER';
const EVENTS_TIMEOUT_MS = 30_000;
const LIVE_TIMEOUT_MS = 30_000;
const EDITOR_TEST_ID = 'document-editor';
const PAGE_SELECTOR = '.superdoc-page';
const NARROW_VIEWPORT = { width: 375, height: 812 };
const WIDE_VIEWPORT = { width: 1280, height: 800 };
const LONG_TITLE_PREFIX =
  'Quarterly operating plan with every regional hiring forecast and the full budget review for each office across the whole company next year';
const TITLE_LINE_CLAMP = '2';
const UNAVAILABLE_TIMEOUT_MS = 20_000;
const FIRST_PARAGRAPH_CLICK_POSITION = { x: 120, y: 120 };
const TYPED_SENTENCE = 'Typed into a new document.';
const FRESH_MEMBER_NAME = 'Fresh';
const BRIEF_PATH = resolve('docs/brief/superdoc-eng-sample-project.docx');
const BRIEF_FILE_NAME = 'brief.docx';
const THUMBNAIL_TEST_ID = 'document-thumbnail';
const CARDS_GRID_TEST_ID = 'document-cards';
const THUMBNAIL_PATH_FRAGMENT = '/thumbnail';
const THUMBNAIL_TIMEOUT_MS = THUMBNAIL_CAPTURE_DELAY_MS + LIVE_TIMEOUT_MS;
const DOCUMENT_PATH_PATTERN = /\/documents\/[^/?#]+/;

function uniqueFileName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}.docx`;
}

async function chooseTableView(page: Page): Promise<void> {
  await page.getByRole('radio', { name: TABLE_VIEW_LABEL }).click();
  await expect(page.getByRole('radio', { name: TABLE_VIEW_LABEL })).toBeChecked();
}

function cardOf({ page, title }: { page: Page; title: string }) {
  return page.getByRole('article').filter({ hasText: title });
}

function titleOf(fileName: string): string {
  return fileName.replace(/\.docx$/, '');
}

test('upload, open, type and the events attribute the text to me', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await typeInParagraph({ page: ana.page, paragraphText: OWNER_PARAGRAPH, text: MINE_MARKER });
  await expect
    .poll(async () => insertedBy({ events: await readEvents({ page: ana.page, documentId }), userId: ana.userId }), {
      timeout: EVENTS_TIMEOUT_MS,
    })
    .toBe(MINE_MARKER);
});

test('a reader cannot type but sees live edits', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Read });
  await editorText(bruno.page).first().click();
  await bruno.page.keyboard.type(READER_TEXT);
  await typeInParagraph({ page: ana.page, paragraphText: OWNER_PARAGRAPH, text: AFTER_MARKER });
  await expect.poll(() => readEditorText(bruno.page), { timeout: LIVE_TIMEOUT_MS }).toContain(AFTER_MARKER.trim());
  expect(await readEditorText(bruno.page)).not.toContain(READER_TEXT);
  expect(await readEditorText(ana.page)).not.toContain(READER_TEXT);
  const events = await readEvents({ page: ana.page, documentId });
  expect(insertedBy({ events, userId: bruno.userId })).toBe('');
  await expect(bruno.page.getByText(READ_ONLY_BADGE_LABEL)).toBeVisible();
});

test('a reader waits until the room exists', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const created = await ana.page.request.post(ApiPath.Documents, { data: { title: titleOf(uniqueFileName('blank')) } });
  const { id: documentId } = (await created.json()) as DocumentSummary;
  await acceptShareLink({ page: bruno.page, documentId, role: ShareLinkRole.Read, owner: ana.page });
  await expect(bruno.page.getByText(PREPARING_DOCUMENT_MESSAGE)).toBeVisible();
  await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).toHaveCount(0);
  await ana.page.goto(documentPagePath(documentId));
  await expect(ana.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
  await expect
    .poll(async () => (await bruno.page.request.get(documentApiPath({ documentId }))).ok(), { timeout: LIVE_TIMEOUT_MS })
    .toBe(true);
  await bruno.page.reload();
  await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
  await expect(bruno.page.getByText(READ_ONLY_BADGE_LABEL)).toBeVisible();
});

test('a share link adds the document to Shared with me', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const caio = await signedInContext({ browser, user: DEMO_USERS[2]! });
  const fileName = uniqueFileName('shared');
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName });
  const links = await readShareLinks({ page: ana.page, documentId });
  await caio.page.goto(new URL(links[ShareLinkRole.Edit]).pathname);
  await expect(caio.page).toHaveURL(documentPagePath(documentId));
  await caio.page.goto(AppRoute.Documents);
  await chooseTableView(caio.page);
  const sharedSection = caio.page.locator('section', { has: caio.page.getByRole('heading', { name: SHARED_HEADING }) });
  const row = sharedSection.getByRole('row', { name: new RegExp(titleOf(fileName)) });
  await expect(row).toContainText(ROLE_LABELS[DocumentRole.Editor]);
});

test('an invalid share link says so', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await ana.page.goto('/share/nope');
  await expect(ana.page.getByText(INVALID_SHARE_LINK_MESSAGE)).toBeVisible();
});

test('rename persists after reload', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const originalFileName = uniqueFileName('rename');
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName: originalFileName });
  const renamed = titleOf(uniqueFileName('renamed'));
  await titleButton({ page: ana.page, title: titleOf(originalFileName) }).click();
  const titleInput = ana.page.getByLabel(TITLE_LABEL, { exact: true });
  await titleInput.fill(renamed);
  const renameResponse = ana.page.waitForResponse((response) => response.request().method() === HttpMethod.Patch);
  await titleInput.press('Enter');
  expect((await renameResponse).ok()).toBe(true);
  await ana.page.reload();
  await expect(titleButton({ page: ana.page, title: renamed })).toBeVisible();
});

test('delete removes the document for everyone', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const dani = await signedInContext({ browser, user: DEMO_USERS[3]! });
  const fileName = uniqueFileName('delete');
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName });
  await shareAndAccept({ owner: ana.page, member: dani.page, documentId, role: ShareLinkRole.Edit });
  await ana.page.getByRole('button', { name: MORE_ACTIONS_LABEL }).click();
  await ana.page.getByRole('menuitem', { name: DELETE_LABEL }).click();
  await ana.page.getByRole('button', { name: DELETE_CONFIRM_LABEL }).click();
  await expect(ana.page).toHaveURL(AppRoute.Documents);
  await expect(dani.page.getByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeVisible({ timeout: UNAVAILABLE_TIMEOUT_MS });
  await dani.page.reload();
  await expect(dani.page.getByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeVisible();
  await dani.page.goto(AppRoute.Documents);
  await expect(dani.page.getByText(titleOf(fileName))).toHaveCount(0);
});

test('the editor page never scrolls horizontally on a narrow viewport', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await ana.page.setViewportSize(NARROW_VIEWPORT);
  await expect.poll(() => ana.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(NARROW_VIEWPORT.width);
});

test('on a narrow viewport the page starts at the left edge and the editor never scrolls sideways', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await ana.page.setViewportSize(NARROW_VIEWPORT);
  await ana.page.reload();
  const editor = ana.page.getByTestId(EDITOR_TEST_ID);
  await ana.page.locator(PAGE_SELECTOR).first().waitFor();
  await expect.poll(() => editor.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await expect
    .poll(() =>
      editor.evaluate((element, pageSelector) => {
        const page = element.querySelector(pageSelector);
        if (!page) throw new Error('no page rendered');
        return Math.round(page.getBoundingClientRect().left - element.getBoundingClientRect().left);
      }, PAGE_SELECTOR),
    )
    .toBe(0);
});

test('the Download button exports the live document', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const fileName = uniqueFileName('export');
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName });
  const download = ana.page.waitForEvent('download');
  await downloadButton(ana.page).click();
  expect((await download).suggestedFilename()).toBe(fileName);
});

test('the list never scrolls sideways at 375 and clamps a long title to two lines', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const fileName = uniqueFileName(LONG_TITLE_PREFIX);
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName });
  await ana.page.setViewportSize(NARROW_VIEWPORT);
  await ana.page.goto(AppRoute.Documents);
  await chooseTableView(ana.page);
  const titleLink = ana.page.getByRole('link', { name: titleOf(fileName) });
  const titleText = titleLink.locator('span');
  await expect(titleLink).toBeVisible();
  await expect(titleText).toHaveCSS('-webkit-line-clamp', TITLE_LINE_CLAMP);
  await expect.poll(() => titleText.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  await expect
    .poll(() =>
      ana.page
        .getByRole('list')
        .first()
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(0);
  await expect
    .poll(() => ana.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
});

test('a new document accepts typing after a click', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await ana.page.getByRole('button', { name: NEW_DOCUMENT_LABEL }).click();
  await expect(ana.page.getByTestId(EDITOR_TEST_ID)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  const documentId = documentIdOf(ana.page.url());
  await focusEditorAtEnd({ page: ana.page, target: ana.page.locator(PAGE_SELECTOR).first(), position: FIRST_PARAGRAPH_CLICK_POSITION });
  await ana.page.keyboard.insertText(TYPED_SENTENCE);
  await expect(editorText(ana.page).filter({ hasText: TYPED_SENTENCE }).first()).toBeVisible();
  await expect
    .poll(async () => insertedBy({ events: await readEvents({ page: ana.page, documentId }), userId: ana.userId }), {
      timeout: EVENTS_TIMEOUT_MS,
    })
    .toBe(TYPED_SENTENCE);
  await ana.page.reload();
  await expect(editorText(ana.page).filter({ hasText: TYPED_SENTENCE }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
});

async function freshMember(browser: Browser): Promise<OpenedContext> {
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  const url = await generateInvite({ page: admin.page });
  const member = await acceptInvite({ browser, url, name: FRESH_MEMBER_NAME, email: uniqueEmail('fresh') });
  await expectSignedInAs({ page: member.page, name: FRESH_MEMBER_NAME });
  return member;
}

async function draggedFiles({ page, files }: { page: Page; files: { name: string; bytes: Buffer }[] }) {
  return page.evaluateHandle(
    ({ entries, mimeType }) => {
      const dataTransfer = new DataTransfer();
      entries.forEach(({ name, base64 }) => {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        dataTransfer.items.add(new File([bytes], name, { type: mimeType }));
      });
      return dataTransfer;
    },
    { entries: files.map(({ name, bytes }) => ({ name, base64: bytes.toString('base64') })), mimeType: DOCX_MIME_TYPE },
  );
}

test('a fresh user sees the empty state and it disappears after New document', async ({ browser }) => {
  const member = await freshMember(browser);
  await expect(member.page.getByRole('heading', { name: EMPTY_STATE_HEADING })).toBeVisible();
  await expect(member.page.getByText(DROP_ZONE_LABEL)).toBeVisible();
  await expect(member.page.getByRole('button', { name: UPLOAD_LABEL })).toHaveCount(0);
  await member.page.getByRole('button', { name: NEW_DOCUMENT_LABEL }).click();
  await expect(member.page.getByTestId(EDITOR_TEST_ID)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await member.page.goto(AppRoute.Documents);
  await expect(member.page.getByRole('button', { name: UPLOAD_LABEL })).toBeVisible();
  await expect(member.page.getByRole('heading', { name: EMPTY_STATE_HEADING })).toHaveCount(0);
});

test('dropping the brief on the page uploads it', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const dataTransfer = await draggedFiles({ page: ana.page, files: [{ name: BRIEF_FILE_NAME, bytes: readFileSync(BRIEF_PATH) }] });
  await ana.page.dispatchEvent('body', 'dragenter', { dataTransfer });
  await expect(ana.page.getByText(DROP_OVERLAY_LABEL)).toBeVisible();
  await ana.page.dispatchEvent('body', 'drop', { dataTransfer });
  await expect(ana.page).toHaveURL(DOCUMENT_PATH_PATTERN);
  await expect(ana.page.locator(PAGE_SELECTOR).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
});

test('the overlay follows the drag, and two dropped files upload nothing', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bytes = readFileSync(BRIEF_PATH);
  const dataTransfer = await draggedFiles({
    page: ana.page,
    files: [
      { name: 'first.docx', bytes },
      { name: 'second.docx', bytes },
    ],
  });
  await ana.page.dispatchEvent('body', 'dragenter', { dataTransfer });
  await expect(ana.page.getByText(DROP_OVERLAY_LABEL)).toBeVisible();
  await ana.page.dispatchEvent('body', 'dragleave', { dataTransfer });
  await expect(ana.page.getByText(DROP_OVERLAY_LABEL)).toHaveCount(0);
  await ana.page.dispatchEvent('body', 'dragenter', { dataTransfer });
  await ana.page.dispatchEvent('body', 'drop', { dataTransfer });
  await expect(ana.page.getByRole('alert')).toHaveText(ONE_FILE_AT_A_TIME_MESSAGE);
  await expect(ana.page.getByText(DROP_OVERLAY_LABEL)).toHaveCount(0);
  await expect(ana.page).toHaveURL(AppRoute.Documents);
});

test('the home opens in cards and a card shows the text typed into its document', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const fileName = uniqueFileName('card');
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName });
  await typeInParagraph({ page: ana.page, paragraphText: OWNER_PARAGRAPH, text: MINE_MARKER });
  await ana.page.goto(AppRoute.Documents);
  await expect(ana.page.getByRole('radio', { name: CARDS_VIEW_LABEL })).toBeChecked();
  await expect(ana.page.getByRole('table')).toHaveCount(0);
  await expect
    .poll(
      async () => {
        await ana.page.reload();
        return cardOf({ page: ana.page, title: titleOf(fileName) })
          .getByTestId(THUMBNAIL_TEST_ID)
          .textContent({ timeout: LIVE_TIMEOUT_MS });
      },
      { timeout: EVENTS_TIMEOUT_MS },
    )
    .toContain(MINE_MARKER.trim());
});

test('the toggle switches to the table and the choice survives a reload', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName: uniqueFileName('toggle') });
  await ana.page.goto(AppRoute.Documents);
  await expect(ana.page.getByRole('article').first()).toBeVisible();
  await chooseTableView(ana.page);
  await expect(ana.page.getByRole('table').first()).toBeVisible();
  await ana.page.reload();
  await expect(ana.page.getByRole('radio', { name: TABLE_VIEW_LABEL })).toBeChecked();
  await expect(ana.page.getByRole('table').first()).toBeVisible();
  await expect(ana.page.getByRole('article')).toHaveCount(0);
});

test('at 375 the cards are one column and the page never scrolls sideways', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName: uniqueFileName(LONG_TITLE_PREFIX) });
  await ana.page.setViewportSize(NARROW_VIEWPORT);
  await ana.page.goto(AppRoute.Documents);
  const grid = ana.page.getByTestId(CARDS_GRID_TEST_ID).first();
  await expect(grid).toBeVisible();
  await expect.poll(() => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  await expect
    .poll(() => ana.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
});

for (const viewport of [WIDE_VIEWPORT, NARROW_VIEWPORT]) {
  test(`a long-title card and a short-title card are equally tall at ${viewport.width}`, async ({ browser }) => {
    const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
    const longFileName = uniqueFileName(LONG_TITLE_PREFIX);
    const shortFileName = uniqueFileName('short');
    await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName: longFileName });
    await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName: shortFileName });
    await ana.page.setViewportSize(viewport);
    await ana.page.goto(AppRoute.Documents);
    const longCard = cardOf({ page: ana.page, title: titleOf(longFileName) });
    const shortCard = cardOf({ page: ana.page, title: titleOf(shortFileName) });
    await expect(longCard).toBeVisible();
    await expect(shortCard).toBeVisible();
    const heightOf = (card: typeof longCard): Promise<number> => card.evaluate((element) => element.getBoundingClientRect().height);
    await expect.poll(async () => (await heightOf(longCard)) - (await heightOf(shortCard))).toBe(0);
  });
}

test('a typed document returns to the home with its captured page on the card', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const fileName = uniqueFileName('captured');
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName });
  await typeInParagraph({ page: ana.page, paragraphText: OWNER_PARAGRAPH, text: MINE_MARKER });
  await expect(ana.page.getByTestId(EDITOR_TEST_ID)).toHaveAttribute(THUMBNAIL_UPLOADS_ATTRIBUTE, /^[1-9]\d*$/, {
    timeout: THUMBNAIL_TIMEOUT_MS,
  });
  await ana.page.goto(AppRoute.Documents);
  const image = cardOf({ page: ana.page, title: titleOf(fileName) })
    .getByTestId(THUMBNAIL_TEST_ID)
    .getByRole('img', { includeHidden: true });
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(THUMBNAIL_WIDTH_PX);
});

test('a reader sees the edits and uploads no thumbnail', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Read });
  const readerRequests: string[] = [];
  bruno.page.on('request', (request) => {
    if (request.url().includes(THUMBNAIL_PATH_FRAGMENT)) readerRequests.push(`${request.method()} ${request.url()}`);
  });
  await bruno.page.clock.install();
  await typeInParagraph({ page: ana.page, paragraphText: OWNER_PARAGRAPH, text: AFTER_MARKER });
  await expect.poll(() => readEditorText(bruno.page), { timeout: LIVE_TIMEOUT_MS }).toContain(AFTER_MARKER.trim());
  await bruno.page.clock.fastForward(THUMBNAIL_CAPTURE_DELAY_MS * 2);
  expect(readerRequests).toEqual([]);
  await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).not.toHaveAttribute(THUMBNAIL_UPLOADS_ATTRIBUTE);
});
