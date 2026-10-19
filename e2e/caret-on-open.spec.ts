import { DEMO_USERS, ShareLinkRole } from '../libs/types/src';
import { NEW_DOCUMENT_LABEL } from '../apps/web/src/features/documents/documents-copy';
import { EDIT_REJECTED_MESSAGE } from '../apps/web/src/features/editor/editor-copy';
import { EDITOR_READY_TIMEOUT_MS, editorText, shareAndAccept, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';

const EDITOR_TEST_ID = 'document-editor';
const LOCAL_CARET_SELECTOR = "[data-v2-local-selection-caret='true']";
const TYPED_TEXT = 'Hello';
const SEED_PARAGRAPH = 'Paragraph owned by ana.';

test('a new document accepts typing without a click', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await ana.page.getByRole('button', { name: NEW_DOCUMENT_LABEL }).click();
  await expect(ana.page.getByTestId(EDITOR_TEST_ID)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await expect(ana.page.locator(LOCAL_CARET_SELECTOR)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await ana.page.keyboard.type(TYPED_TEXT);
  await expect(editorText(ana.page).filter({ hasText: TYPED_TEXT }).first()).toBeVisible();
  await expect(ana.page.getByText(EDIT_REJECTED_MESSAGE)).toBeHidden();
});

test('a joiner types without a click', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: [SEED_PARAGRAPH] });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await expect(bruno.page.locator(LOCAL_CARET_SELECTOR)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await bruno.page.keyboard.type(TYPED_TEXT);
  await expect(editorText(bruno.page).filter({ hasText: TYPED_TEXT }).first()).toBeVisible();
  await expect(editorText(ana.page).filter({ hasText: TYPED_TEXT }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await expect(bruno.page.getByText(EDIT_REJECTED_MESSAGE)).toBeHidden();
});

test('a reader has no caret', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: [SEED_PARAGRAPH] });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Read });
  await expect(bruno.page.locator(LOCAL_CARET_SELECTOR)).toHaveCount(0);
});
