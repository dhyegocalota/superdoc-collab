import { randomUUID } from 'node:crypto';
import {
  ApiPath,
  AppRoute,
  DEMO_USERS,
  DOCUMENT_NOT_READY_MESSAGE,
  DOCUMENT_UNAVAILABLE_MESSAGE,
  DocumentRole,
  HttpMethod,
  INVALID_SHARE_LINK_MESSAGE,
  READ_ONLY_BADGE_LABEL,
  ShareLinkRole,
  documentApiPath,
  documentPagePath,
  type DocumentSummary,
} from '../libs/types/src';
import { acceptShareLink, editorText, readEditorText, readEvents, readShareLinks, shareAndAccept, typeInParagraph, uploadSeed, insertedBy } from './editor';
import { SHARED_HEADING } from '../apps/web/src/features/documents/documents-copy';
import { DELETE_CONFIRM_LABEL, DELETE_LABEL, TITLE_LABEL } from '../apps/web/src/features/editor/editor-copy';
import { expect, signedInContext, test } from './fixtures';

const PARAGRAPHS = ['Paragraph owned by ana.', 'Paragraph owned by bruno.'];
const OWNER_PARAGRAPH = 'owned by ana';
const MINE_MARKER = ' <MINE>';
const AFTER_MARKER = ' <AFTER>';
const READER_TEXT = 'READER';
const EVENTS_TIMEOUT_MS = 30_000;
const LIVE_TIMEOUT_MS = 30_000;
const EDITOR_TEST_ID = 'document-editor';

function uniqueFileName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}.docx`;
}

function titleOf(fileName: string): string {
  return fileName.replace(/\.docx$/, '');
}

test('upload, open, type and the events attribute the text to me', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS });
  await typeInParagraph({ page: ana.page, paragraphText: OWNER_PARAGRAPH, text: MINE_MARKER });
  await expect
    .poll(async () => insertedBy({ events: await readEvents({ page: ana.page, documentId }), userId: ana.userId }), { timeout: EVENTS_TIMEOUT_MS })
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
  await expect(bruno.page.getByText(DOCUMENT_NOT_READY_MESSAGE)).toBeVisible();
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
  const sharedSection = caio.page.locator('section', { has: caio.page.getByRole('heading', { name: SHARED_HEADING }) });
  const row = sharedSection.getByRole('row', { name: new RegExp(titleOf(fileName)) });
  await expect(row).toContainText(DocumentRole.Editor);
});

test('an invalid share link says so', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await ana.page.goto('/share/nope');
  await expect(ana.page.getByText(INVALID_SHARE_LINK_MESSAGE)).toBeVisible();
});

test('rename persists after reload', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName: uniqueFileName('rename') });
  const renamed = titleOf(uniqueFileName('renamed'));
  const titleInput = ana.page.getByLabel(TITLE_LABEL, { exact: true });
  await titleInput.fill(renamed);
  const renameResponse = ana.page.waitForResponse((response) => response.request().method() === HttpMethod.Patch);
  await titleInput.press('Enter');
  expect((await renameResponse).ok()).toBe(true);
  await ana.page.reload();
  await expect(ana.page.getByLabel(TITLE_LABEL, { exact: true })).toHaveValue(renamed);
});

test('delete removes the document for everyone', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const dani = await signedInContext({ browser, user: DEMO_USERS[3]! });
  const fileName = uniqueFileName('delete');
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName });
  await shareAndAccept({ owner: ana.page, member: dani.page, documentId, role: ShareLinkRole.Edit });
  await ana.page.getByRole('button', { name: DELETE_LABEL, exact: true }).click();
  await ana.page.getByRole('button', { name: DELETE_CONFIRM_LABEL }).click();
  await expect(ana.page).toHaveURL(AppRoute.Documents);
  await dani.page.reload();
  await expect(dani.page.getByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeVisible();
  await dani.page.goto(AppRoute.Documents);
  await expect(dani.page.getByText(titleOf(fileName))).toHaveCount(0);
});
