import { expect, type Locator, type Page } from '@playwright/test';
import {
  AppRoute,
  DocumentResource,
  documentApiPath,
  DOCX_MIME_TYPE,
  TimelineQueryParam,
  type DocumentEditEvent,
  type DocumentEditEvents,
  type ShareLinkRole,
  type ShareLinks,
} from '../libs/types/src';
import { buildSeedDocx } from '../libs/history/src';
import { THEME_LABELS, accountMenuLabel } from '../apps/web/src/features/account/account-copy';
import { SIGN_OUT_LABEL } from '../apps/web/src/features/auth/auth-copy';
import { FILE_INPUT_LABEL, UPLOAD_LABEL } from '../apps/web/src/features/documents/documents-copy';
import {
  DOWNLOAD_BUTTON_LABEL,
  DOWNLOAD_OPTIONS_LABEL,
  HOME_LINK_LABEL,
  renameTitleLabel,
} from '../apps/web/src/features/editor/editor-copy';
import type { ThemePreference } from '../apps/web/src/lib/use-theme';

export const TEXT_RUN_SELECTOR = '.superdoc-text-run';
export const EDITOR_INPUT_SELECTOR = 'textarea';
export const REMOTE_CARET_SELECTOR = '.v2-collaboration-overlay__remote-caret';
const TOOLBAR_ROW_TEST_ID = 'editor-toolbar-row';
const DOCUMENT_URL_PATTERN = /\/documents\/([^/?#]+)/;
const UPLOAD_FILE_NAME = 'Plan.docx';
const FOCUS_TIMEOUT_MS = 30_000;
export const EDITOR_READY_TIMEOUT_MS = 60_000;
const TYPING_DELAY_MS = 20;

export function editorText(page: Page) {
  return page.locator(TEXT_RUN_SELECTOR);
}

export function topBar(page: Page): Locator {
  return page.getByRole('banner');
}

export function toolbarRow(page: Page): Locator {
  return page.getByTestId(TOOLBAR_ROW_TEST_ID);
}

export function brandLink(page: Page): Locator {
  return topBar(page).getByRole('link', { name: HOME_LINK_LABEL });
}

export function accountTrigger({ page, name }: { page: Page; name: string }): Locator {
  return topBar(page).getByRole('button', { name: accountMenuLabel(name) });
}

export function titleButton({ page, title }: { page: Page; title: string }): Locator {
  return topBar(page).getByRole('button', { name: renameTitleLabel(title) });
}

export function downloadButton(page: Page): Locator {
  return page.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL, exact: true });
}

export function downloadOptionsButton(page: Page): Locator {
  return page.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL });
}

export async function chooseTheme({ page, name, theme }: { page: Page; name: string; theme: ThemePreference }): Promise<void> {
  await accountTrigger({ page, name }).click();
  await page.getByRole('menuitemradio', { name: THEME_LABELS[theme] }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(accountTrigger({ page, name })).toBeFocused();
}

export async function signOut({ page, name }: { page: Page; name: string }): Promise<void> {
  await accountTrigger({ page, name }).click();
  await page.getByRole('menuitem', { name: SIGN_OUT_LABEL }).click();
}

export async function readEditorText(page: Page): Promise<string> {
  return (await editorText(page).allTextContents()).join('');
}

export async function openDocumentFileInput(page: Page): Promise<void> {
  const uploadButton = page.getByRole('button', { name: UPLOAD_LABEL });
  await uploadButton.or(page.getByLabel(FILE_INPUT_LABEL)).waitFor();
  if (await uploadButton.isVisible()) await uploadButton.click();
}

export async function uploadSeed({
  page,
  paragraphs,
  fileName = UPLOAD_FILE_NAME,
}: {
  page: Page;
  paragraphs: string[];
  fileName?: string;
}): Promise<string> {
  const buffer = await buildSeedDocx(paragraphs.map((text) => ({ text, trackedChanges: [] })));
  await page.goto(AppRoute.Documents);
  await openDocumentFileInput(page);
  await page.getByLabel(FILE_INPUT_LABEL).setInputFiles({ name: fileName, mimeType: DOCX_MIME_TYPE, buffer });
  await expect(page).toHaveURL(DOCUMENT_URL_PATTERN);
  await expect(editorText(page).filter({ hasText: paragraphs[0]! }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  return documentIdOf(page.url());
}

export function documentIdOf(url: string): string {
  const match = DOCUMENT_URL_PATTERN.exec(url);
  if (!match) throw new Error(`no document id in ${url}`);
  return match[1]!;
}

export async function readShareLinks({ page, documentId }: { page: Page; documentId: string }): Promise<ShareLinks> {
  const response = await page.request.get(documentApiPath({ documentId, resource: DocumentResource.ShareLinks }));
  return (await response.json()) as ShareLinks;
}

export async function acceptShareLink({
  page,
  documentId,
  role,
  owner,
}: {
  page: Page;
  documentId: string;
  role: ShareLinkRole;
  owner: Page;
}): Promise<void> {
  const links = await readShareLinks({ page: owner, documentId });
  await page.goto(new URL(links[role]).pathname);
  await expect(page).toHaveURL(DOCUMENT_URL_PATTERN);
}

export async function shareAndAccept({
  owner,
  member,
  documentId,
  role,
}: {
  owner: Page;
  member: Page;
  documentId: string;
  role: ShareLinkRole;
}): Promise<void> {
  await acceptShareLink({ page: member, documentId, role, owner });
  await expect
    .poll(
      async () => {
        const [ownerText, memberText] = await Promise.all([readEditorText(owner), readEditorText(member)]);
        return ownerText.length > 0 && ownerText === memberText;
      },
      { timeout: EDITOR_READY_TIMEOUT_MS },
    )
    .toBe(true);
}

async function isEditorFocused(page: Page): Promise<boolean> {
  return page.evaluate((selector) => document.activeElement?.matches(selector) === true, EDITOR_INPUT_SELECTOR);
}

export async function focusEditorAtEnd({
  page,
  target,
  position,
}: {
  page: Page;
  target: Locator;
  position?: { x: number; y: number };
}): Promise<void> {
  await expect(async () => {
    await target.click({ position });
    await page.keyboard.press('End');
    expect(await isEditorFocused(page)).toBe(true);
  }).toPass({ timeout: FOCUS_TIMEOUT_MS });
}

async function focusParagraphEnd({ page, paragraphText }: { page: Page; paragraphText: string }): Promise<void> {
  await focusEditorAtEnd({ page, target: editorText(page).filter({ hasText: paragraphText }).first() });
}

export async function insertInParagraph({ page, paragraphText, text }: { page: Page; paragraphText: string; text: string }): Promise<void> {
  await focusParagraphEnd({ page, paragraphText });
  await page.keyboard.insertText(text);
}

export async function typeInParagraph({ page, paragraphText, text }: { page: Page; paragraphText: string; text: string }): Promise<void> {
  await focusParagraphEnd({ page, paragraphText });
  for (const character of text) {
    if (!(await isEditorFocused(page))) await focusParagraphEnd({ page, paragraphText });
    await page.keyboard.type(character, { delay: TYPING_DELAY_MS });
  }
}

export async function readEventsPage({
  page,
  documentId,
  afterSequence,
}: {
  page: Page;
  documentId: string;
  afterSequence: number | null;
}): Promise<DocumentEditEvents> {
  const path = documentApiPath({ documentId, resource: DocumentResource.Events });
  const query = afterSequence === null ? '' : `?${TimelineQueryParam.AfterSequence}=${afterSequence}`;
  const response = await page.request.get(`${path}${query}`);
  return (await response.json()) as DocumentEditEvents;
}

export async function readEvents({
  page,
  documentId,
  afterSequence = null,
}: {
  page: Page;
  documentId: string;
  afterSequence?: number | null;
}): Promise<DocumentEditEvent[]> {
  const { events, nextAfterSequence } = await readEventsPage({ page, documentId, afterSequence });
  if (nextAfterSequence === null) return events;
  return [...events, ...(await readEvents({ page, documentId, afterSequence: nextAfterSequence }))];
}

export function insertedBy({ events, userId }: { events: DocumentEditEvent[]; userId: string }): string {
  return events
    .filter((event) => event.authors.length === 1 && event.authors[0]!.id === userId)
    .map((event) => event.inserted)
    .join('');
}

export function expectEveryCharacterAccounted({
  events,
  initialLength,
  finalLength,
}: {
  events: DocumentEditEvent[];
  initialLength: number;
  finalLength: number;
}): void {
  const insertedTotal = events.reduce((sum, event) => sum + event.inserted.length, 0);
  const deletedTotal = events.reduce((sum, event) => sum + event.deleted.length, 0);
  expect(insertedTotal - deletedTotal).toBe(finalLength - initialLength);
}
