import type { Browser, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ApiPath,
  AppRoute,
  DEMO_ADMIN,
  DEMO_USERS,
  DOCX_MIME_TYPE,
  documentPagePath,
  HttpMethod,
  HttpStatus,
  RETRY_AFTER_HEADER,
  ShareLinkRole,
  type DocumentSummary,
} from '../libs/types/src';
import {
  McpClient,
  MCP_CLIENT_LABELS,
  documentPrompts,
  USE_WITH_AI_LABEL,
  USE_WITH_AI_TITLE,
} from '../apps/web/src/features/connected-apps/connected-apps-copy';
import {
  EXPORT_FAILED_MESSAGE,
  FIND_IN_DOCUMENT_LABEL,
  DOWNLOAD_PDF_LABEL,
  goToCursorLabel,
  movedToCursorMessage,
  offlineMemberReason,
  PREPARING_PDF_MESSAGE,
  TIMELINE_TOGGLE_LABEL,
  TITLE_LABEL,
} from '../apps/web/src/features/editor/editor-copy';
import { FILE_INPUT_LABEL, UPLOAD_LABEL } from '../apps/web/src/features/documents/documents-copy';
import { PREPARING_DOCUMENT_MESSAGE } from '../apps/web/src/features/editor/waiting-copy';
import {
  GROUPING_TOPICS_MESSAGE,
  PANEL_POSITION_LABEL,
  PANEL_POSITION_LABELS,
  SUMMARIZING_EDITS_MESSAGE,
  SUMMARY_UP_TO_DATE_MESSAGE,
  TIMELINE_HEADING,
} from '../apps/web/src/features/timeline/timeline-copy';
import { PanelPosition, PANEL_POSITION_STORAGE_KEY } from '../apps/web/src/features/timeline/use-panel-position';
import { THEME_STORAGE_KEY, ThemePreference } from '../apps/web/src/lib/use-theme';
import {
  acceptShareLink,
  accountTrigger,
  brandLink,
  chooseTheme,
  downloadButton,
  downloadOptionsButton,
  insertInParagraph,
  REMOTE_CARET_SELECTOR,
  shareAndAccept,
  titleButton,
  toolbarRow,
  topBar,
  uploadSeed,
} from './editor';
import { expect, signedInContext, test } from './fixtures';
import {
  BANDS_TIMEOUT_MS,
  BRUNO,
  BUDGET,
  BUDGET_PARAGRAPH,
  HIRING,
  HIRING_PARAGRAPH,
  pressInChart,
  summarizeButton,
  summaryCard,
  VERSION_TIMEOUT_MS,
  versionBanner,
  viewerFrame,
  waitForBands,
  waitForSettledTimeline,
  waitForSummarizeResponse,
} from './timeline';

const [anaUser, brunoUser, caioUser, daniUser] = DEMO_USERS;
const PARAGRAPHS = [BUDGET_PARAGRAPH, HIRING_PARAGRAPH];
const ROADMAP = 'Roadmap';
const ROADMAP_PARAGRAPH = 'Roadmap: we ship in March.';
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const WIDE_VIEWPORT = { width: 1536, height: 864 };
const SHORT_VIEWPORT = { width: 1280, height: 480 };
const PHONE_VIEWPORT = { width: 375, height: 812 };
const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1280, 1536, 1920, 2560];
const VIEWPORT_HEIGHT = 800;
const TWO_MEMBER_WIDTHS = [640, 700, 768, 800, 1023];
const MINIMUM_TITLE_WIDTH_PX = 96;
const FIVE_MEMBER_WIDTH = 640;
const MINIMUM_FIVE_MEMBER_TITLE_WIDTH_PX = 80;
const PAGE_CENTRE_TOLERANCE_PX = 2;
const PAGE_CENTRED_FROM_WIDTH_PX = 1024;
const LONG_DOCUMENT_LINES = 40;
const LAST_LINE_PREFIX = 'Line 40';
const RENAMED_TITLE = 'Renamed';
const DISCARDED_TITLE = 'Discard';
const FIRST_EDIT = ' More money';
const SECOND_EDIT = ' and more';
const BRUNO_EDIT = ' from Bruno';
const SUMMARY_TIMEOUT_MS = 30_000;
const WAITING_TIMEOUT_MS = 30_000;
const PRINT_TIMEOUT_MS = 60_000;
const BRIEF_PATH = resolve('docs/brief/superdoc-eng-sample-project.docx');
const LONG_DOCUMENT_PARAGRAPH_COUNT = 60;
const LONG_DOCUMENT_MIN_PAGES = 4;
const LONG_DOCUMENT_FIRST_LINE = 'Opening line of the long plan.';
const EDITED_PHRASE = 'edited';
const RETRY_IN_PATTERN = /Try again in \d+ s\./;
const DARK_CLASS_PATTERN = /(^|\s)dark(\s|$)/;
const PANEL_SELECTOR = 'aside[data-position]';
const PANEL_OPEN_STATE = 'open';
const COLLAPSED_BAR_TEST_ID = 'timeline-collapsed-bar';
const EDITOR_TEST_ID = 'document-editor';
const PAGE_SELECTOR = '.superdoc-page';
const TOP_BAR_SELECTOR = 'header';

type PrintState = { calls: number; pageCount: number; emptyPageCount: number; isPreparingSeen: boolean };
type WindowWithRecords = Window & { printState: PrintState; seenSummaryMessages: string[]; topBarTops: number[] };

function stubPrint(preparingMessage: string): void {
  if (window === window.top) {
    const state: PrintState = { calls: 0, pageCount: 0, emptyPageCount: -1, isPreparingSeen: false };
    Object.assign(window, { printState: state });
    new MutationObserver(() => {
      if (!document.body) return;
      if (document.body.innerText.includes(preparingMessage)) state.isPreparingSeen = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }
  window.print = () => {
    const state = (window.top as WindowWithRecords).printState;
    const pages = [...document.querySelectorAll('.superdoc-page')];
    state.calls += 1;
    state.pageCount = pages.length;
    state.emptyPageCount = pages.filter((pageElement) => !pageElement.textContent!.trim()).length;
  };
}

function recordSummaryMessages(messages: string[]): void {
  const seen: string[] = [];
  Object.assign(window, { seenSummaryMessages: seen });
  new MutationObserver(() => {
    if (!document.body) return;
    const shown = document.body.innerText;
    messages.filter((message) => shown.includes(message) && !seen.includes(message)).forEach((message) => seen.push(message));
  }).observe(document, { childList: true, subtree: true, characterData: true });
}

function recordTopBarTops(selector: string): void {
  const tops: number[] = [];
  Object.assign(window, { topBarTops: tops });
  function sample(): void {
    const topBarElement = document.querySelector(selector);
    if (topBarElement) tops.push(topBarElement.getBoundingClientRect().top);
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}

function readPrintState(page: Page): Promise<PrintState> {
  return page.evaluate(() => (window as unknown as WindowWithRecords).printState);
}

function readSeenSummaryMessages(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as WindowWithRecords).seenSummaryMessages);
}

async function readTopBarTops(page: Page): Promise<number[]> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => (window as unknown as WindowWithRecords).topBarTops);
}

function readStoredValue({ page, key }: { page: Page; key: string }): Promise<string | null> {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

function uniqueTitle(): string {
  return `Final visuals ${randomUUID().slice(0, 8)}`;
}

async function openDocument({
  page,
  title,
  paragraphs = PARAGRAPHS,
  viewport = DEFAULT_VIEWPORT,
}: {
  page: Page;
  title: string;
  paragraphs?: string[];
  viewport?: { width: number; height: number };
}): Promise<string> {
  await page.setViewportSize(viewport);
  return uploadSeed({ page, paragraphs, fileName: `${title}.docx` });
}

async function ownerOpensDocument({
  browser,
  paragraphs = PARAGRAPHS,
  viewport = DEFAULT_VIEWPORT,
  recordsTopBar = false,
}: {
  browser: Browser;
  paragraphs?: string[];
  viewport?: { width: number; height: number };
  recordsTopBar?: boolean;
}) {
  const ana = await signedInContext({ browser, user: anaUser! });
  if (recordsTopBar) await ana.page.addInitScript(recordTopBarTops, TOP_BAR_SELECTOR);
  const title = uniqueTitle();
  const documentId = await openDocument({ page: ana.page, title, paragraphs, viewport });
  return { ana, title, documentId };
}

function panelPositionChoice({ page, position }: { page: Page; position: PanelPosition }) {
  return page.getByRole('radiogroup', { name: PANEL_POSITION_LABEL }).getByRole('radio', { name: PANEL_POSITION_LABELS[position] });
}

async function expectPageFitsEditor({ page, width }: { page: Page; width: number }): Promise<void> {
  const boxes = await page.evaluate(
    ({ editorTestId, pageSelector }) => {
      const editor = document.querySelector(`[data-testid="${editorTestId}"]`)?.getBoundingClientRect();
      const paper = document.querySelector(pageSelector)?.getBoundingClientRect();
      if (!editor || !paper) throw new Error('the editor or its page is not rendered');
      return { editor: { left: editor.left, right: editor.right }, paper: { left: paper.left, right: paper.right } };
    },
    { editorTestId: EDITOR_TEST_ID, pageSelector: PAGE_SELECTOR },
  );
  expect(boxes.paper.left).toBeGreaterThanOrEqual(boxes.editor.left - PAGE_CENTRE_TOLERANCE_PX);
  expect(boxes.paper.right).toBeLessThanOrEqual(boxes.editor.right + PAGE_CENTRE_TOLERANCE_PX);
  if (width < PAGE_CENTRED_FROM_WIDTH_PX) return;
  const spaceBefore = boxes.paper.left - boxes.editor.left;
  const spaceAfter = boxes.editor.right - boxes.paper.right;
  expect(Math.abs(spaceBefore - spaceAfter)).toBeLessThanOrEqual(PAGE_CENTRE_TOLERANCE_PX);
}

async function expectChromeFits({ page, name }: { page: Page; name: string }): Promise<void> {
  await expect(brandLink(page)).toBeInViewport({ ratio: 1 });
  await expect(accountTrigger({ page, name })).toBeInViewport({ ratio: 1 });
  await expect(summarizeButton(page)).toBeInViewport({ ratio: 1 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const tops = await readTopBarTops(page);
  expect(tops.length).toBeGreaterThan(0);
  expect(tops.filter((top) => top !== 0)).toEqual([]);
}

test('the top bar shows for an editor and the toolbar row is absent for a reader', async ({ browser }) => {
  const { ana, title, documentId } = await ownerOpensDocument({ browser });
  const caio = await signedInContext({ browser, user: caioUser! });
  await shareAndAccept({ owner: ana.page, member: caio.page, documentId, role: ShareLinkRole.Read });
  await expect(brandLink(ana.page)).toBeVisible();
  await expect(titleButton({ page: ana.page, title })).toBeVisible();
  await expect(accountTrigger({ page: ana.page, name: anaUser!.name })).toBeVisible();
  await expect(ana.page.getByRole('button', { name: FIND_IN_DOCUMENT_LABEL })).toBeVisible();
  await expect(ana.page.getByRole('button', { name: USE_WITH_AI_LABEL })).toBeVisible();
  await expect(downloadButton(ana.page)).toBeVisible();
  await expect(toolbarRow(ana.page)).toBeVisible();
  await expect(summarizeButton(ana.page)).toBeVisible();
  await expect(brandLink(caio.page)).toBeVisible();
  await expect(accountTrigger({ page: caio.page, name: caioUser!.name })).toBeVisible();
  await expect(toolbarRow(caio.page)).toHaveCount(0);
});

test('the title renames on Enter and Escape restores it', async ({ browser }) => {
  const { ana, title } = await ownerOpensDocument({ browser });
  await titleButton({ page: ana.page, title }).click();
  const titleInput = ana.page.getByLabel(TITLE_LABEL, { exact: true });
  await titleInput.fill(RENAMED_TITLE);
  const renameResponse = ana.page.waitForResponse((response) => response.request().method() === HttpMethod.Patch);
  await titleInput.press('Enter');
  expect((await renameResponse).ok()).toBe(true);
  await expect(titleButton({ page: ana.page, title: RENAMED_TITLE })).toBeVisible();
  await ana.page.reload();
  await expect(titleButton({ page: ana.page, title: RENAMED_TITLE })).toBeVisible();
  await titleButton({ page: ana.page, title: RENAMED_TITLE }).click();
  await ana.page.getByLabel(TITLE_LABEL, { exact: true }).fill(DISCARDED_TITLE);
  await ana.page.keyboard.press('Escape');
  await expect(titleButton({ page: ana.page, title: RENAMED_TITLE })).toBeVisible();
  await ana.page.reload();
  await expect(titleButton({ page: ana.page, title: RENAMED_TITLE })).toBeVisible();
});

test('Download starts a docx download with no error', async ({ browser }) => {
  const { ana, title } = await ownerOpensDocument({ browser });
  const download = ana.page.waitForEvent('download');
  await downloadButton(ana.page).click();
  expect((await download).suggestedFilename()).toBe(`${title}.docx`);
  await expect(ana.page.getByText(EXPORT_FAILED_MESSAGE)).toHaveCount(0);
});

async function downloadPdf(page: Page): Promise<void> {
  await downloadOptionsButton(page).click();
  await page.getByRole('menuitem', { name: DOWNLOAD_PDF_LABEL }).click();
}

async function uploadBrief(page: Page): Promise<void> {
  await page.goto(AppRoute.Documents);
  await page.getByRole('button', { name: UPLOAD_LABEL }).click();
  await page.getByLabel(FILE_INPUT_LABEL).setInputFiles({ name: 'brief.docx', mimeType: DOCX_MIME_TYPE, buffer: readFileSync(BRIEF_PATH) });
  await expect(page.locator(PAGE_SELECTOR).first()).toBeVisible({ timeout: PRINT_TIMEOUT_MS });
}

async function expectPrintedWithEveryPageFilled({ page, minPages }: { page: Page; minPages: number }): Promise<void> {
  await expect
    .poll(() => readPrintState(page), { timeout: PRINT_TIMEOUT_MS })
    .toMatchObject({ calls: 1, emptyPageCount: 0, isPreparingSeen: true });
  expect((await readPrintState(page)).pageCount).toBeGreaterThanOrEqual(minPages);
}

test('Download PDF prepares the print view and calls print once every page has text', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: anaUser! });
  await ana.page.addInitScript(stubPrint, PREPARING_PDF_MESSAGE);
  await openDocument({ page: ana.page, title: uniqueTitle() });
  await downloadPdf(ana.page);
  await expectPrintedWithEveryPageFilled({ page: ana.page, minPages: 1 });
});

test('Download PDF of a document of at least 4 pages prints only when every page has text', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: anaUser! });
  await ana.page.addInitScript(stubPrint, PREPARING_PDF_MESSAGE);
  const paragraphs = Array.from({ length: LONG_DOCUMENT_PARAGRAPH_COUNT }, (_, index) =>
    index === 0 ? LONG_DOCUMENT_FIRST_LINE : `Paragraph ${index} `.repeat(40),
  );
  await uploadSeed({ page: ana.page, paragraphs });
  await downloadPdf(ana.page);
  await expectPrintedWithEveryPageFilled({ page: ana.page, minPages: LONG_DOCUMENT_MIN_PAGES });
});

test('Download PDF of the uploaded brief prints only when every page has text', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: anaUser! });
  await ana.page.addInitScript(stubPrint, PREPARING_PDF_MESSAGE);
  await uploadBrief(ana.page);
  await downloadPdf(ana.page);
  await expectPrintedWithEveryPageFilled({ page: ana.page, minPages: 1 });
});

test('Dark in the account menu applies to the page and survives a reload', async ({ browser }) => {
  const { ana } = await ownerOpensDocument({ browser });
  await chooseTheme({ page: ana.page, name: anaUser!.name, theme: ThemePreference.Dark });
  await expect(ana.page.locator('html')).toHaveClass(DARK_CLASS_PATTERN);
  expect(await readStoredValue({ page: ana.page, key: THEME_STORAGE_KEY })).toBe(ThemePreference.Dark);
  await ana.page.reload();
  await expect(ana.page.locator('html')).toHaveClass(DARK_CLASS_PATTERN);
  await chooseTheme({ page: ana.page, name: anaUser!.name, theme: ThemePreference.Light });
  await expect(ana.page.locator('html')).not.toHaveClass(DARK_CLASS_PATTERN);
});

test('the version frame follows the theme', async ({ browser }) => {
  const { ana } = await ownerOpensDocument({ browser });
  await insertInParagraph({ page: ana.page, paragraphText: 'Budget:', text: FIRST_EDIT });
  await waitForBands({ page: ana.page, names: [BUDGET] });
  await chooseTheme({ page: ana.page, name: anaUser!.name, theme: ThemePreference.Dark });
  await pressInChart({ page: ana.page, name: BUDGET, keys: ['End'] });
  await expect(versionBanner(ana.page)).toHaveAttribute('data-sequence', /\d+/, { timeout: VERSION_TIMEOUT_MS });
  await expect(viewerFrame(ana.page).locator('html')).toHaveClass(DARK_CLASS_PATTERN);
  await chooseTheme({ page: ana.page, name: anaUser!.name, theme: ThemePreference.Light });
  await expect(viewerFrame(ana.page).locator('html')).not.toHaveClass(DARK_CLASS_PATTERN);
});

test('the panel is at the bottom at 1280 and the side choice survives a reload', async ({ browser }) => {
  const { ana } = await ownerOpensDocument({ browser });
  const panel = ana.page.locator(PANEL_SELECTOR);
  await expect(panel).toHaveAttribute('data-position', PanelPosition.Bottom);
  await panelPositionChoice({ page: ana.page, position: PanelPosition.Side }).click();
  await expect(panel).toHaveAttribute('data-position', PanelPosition.Side);
  expect(await readStoredValue({ page: ana.page, key: PANEL_POSITION_STORAGE_KEY })).toBe(PanelPosition.Side);
  await ana.page.reload();
  await expect(panel).toHaveAttribute('data-position', PanelPosition.Side);
});

test('the panel is at the side at 1536 with no stored choice', async ({ browser }) => {
  const { ana } = await ownerOpensDocument({ browser, viewport: WIDE_VIEWPORT });
  await expect(ana.page.locator(PANEL_SELECTOR)).toHaveAttribute('data-position', PanelPosition.Side);
  await expect(ana.page.getByRole('heading', { name: TIMELINE_HEADING })).toBeVisible();
});

test('the collapsed bar at 375 shows three topic chips and opens on click', async ({ browser }) => {
  const { ana } = await ownerOpensDocument({
    browser,
    paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH, ROADMAP_PARAGRAPH],
    viewport: PHONE_VIEWPORT,
  });
  await insertInParagraph({ page: ana.page, paragraphText: 'Budget:', text: FIRST_EDIT });
  await insertInParagraph({ page: ana.page, paragraphText: 'Hiring:', text: FIRST_EDIT });
  await insertInParagraph({ page: ana.page, paragraphText: 'Roadmap:', text: FIRST_EDIT });
  const collapsedBar = ana.page.getByTestId(COLLAPSED_BAR_TEST_ID);
  await expect(collapsedBar).toBeVisible();
  await Promise.all(
    [BUDGET, HIRING, ROADMAP].map((topic) =>
      expect(collapsedBar.getByRole('button').filter({ hasText: topic })).toBeVisible({ timeout: BANDS_TIMEOUT_MS }),
    ),
  );
  await collapsedBar.getByRole('button', { name: TIMELINE_TOGGLE_LABEL }).click();
  await expect(ana.page.locator(PANEL_SELECTOR)).toHaveAttribute('data-state', PANEL_OPEN_STATE);
  await expect(collapsedBar).toHaveCount(0);
});

test('Summarize shows its steps, then Try again in N s. on a stale selection inside the cooldown', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: anaUser! });
  await ana.page.addInitScript(recordSummaryMessages, [GROUPING_TOPICS_MESSAGE, SUMMARIZING_EDITS_MESSAGE]);
  const documentId = await openDocument({ page: ana.page, title: uniqueTitle() });
  await insertInParagraph({ page: ana.page, paragraphText: 'Budget:', text: FIRST_EDIT });
  await waitForBands({ page: ana.page, names: [BUDGET] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  const firstResponse = waitForSummarizeResponse({ page: ana.page, documentId });
  await summarizeButton(ana.page).click();
  expect([HttpStatus.Ok, HttpStatus.Accepted]).toContain((await firstResponse).status());
  await expect(summaryCard(ana.page)).toContainText(EDITED_PHRASE, { timeout: SUMMARY_TIMEOUT_MS });
  const seen = await readSeenSummaryMessages(ana.page);
  expect(seen).toEqual([GROUPING_TOPICS_MESSAGE, SUMMARIZING_EDITS_MESSAGE].filter((message) => seen.includes(message)));
  await insertInParagraph({ page: ana.page, paragraphText: 'Hiring:', text: SECOND_EDIT });
  await waitForSettledTimeline({ page: ana.page, documentId });
  const busyResponse = waitForSummarizeResponse({ page: ana.page, documentId });
  await summarizeButton(ana.page).click();
  const busy = await busyResponse;
  expect(busy.status()).toBe(HttpStatus.TooManyRequests);
  expect(busy.headers()[RETRY_AFTER_HEADER.toLowerCase()]).toBeTruthy();
  await expect(summaryCard(ana.page)).toContainText(RETRY_IN_PATTERN);
});

test('Summarize on a selection that is fresh everywhere answers that the summary is up to date', async ({ browser }) => {
  const { ana, documentId } = await ownerOpensDocument({ browser });
  await insertInParagraph({ page: ana.page, paragraphText: 'Budget:', text: FIRST_EDIT });
  await waitForBands({ page: ana.page, names: [BUDGET] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(EDITED_PHRASE, { timeout: SUMMARY_TIMEOUT_MS });
  const upToDateResponse = waitForSummarizeResponse({ page: ana.page, documentId });
  await summarizeButton(ana.page).click();
  expect((await upToDateResponse).status()).toBe(HttpStatus.Ok);
  await expect(summaryCard(ana.page)).toContainText(SUMMARY_UP_TO_DATE_MESSAGE);
});

test('a member avatar scrolls the editor to that member’s caret and offline members say why they cannot', async ({ browser }) => {
  const lines = Array.from({ length: LONG_DOCUMENT_LINES }, (_, index) => `Line ${String(index + 1).padStart(2, '0')} of the plan.`);
  const { ana, documentId } = await ownerOpensDocument({ browser, paragraphs: lines, viewport: SHORT_VIEWPORT });
  const bruno = await signedInContext({ browser, user: brunoUser! });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await insertInParagraph({ page: bruno.page, paragraphText: LAST_LINE_PREFIX, text: BRUNO_EDIT });
  const remoteCaret = ana.page.locator(REMOTE_CARET_SELECTOR).first();
  await expect(remoteCaret).toBeAttached({ timeout: WAITING_TIMEOUT_MS });
  await expect(remoteCaret).not.toBeInViewport();
  const jumpButton = topBar(ana.page).getByRole('button', { name: goToCursorLabel(BRUNO) });
  await expect(jumpButton).not.toHaveAttribute('aria-disabled', 'true');
  await jumpButton.click();
  await expect(remoteCaret).toBeInViewport();
  await expect(ana.page.getByText(movedToCursorMessage(BRUNO))).toBeAttached();
  await bruno.page.close();
  const offlineButton = topBar(ana.page).getByRole('button', { name: new RegExp(BRUNO) });
  await expect(offlineButton).toHaveAttribute('aria-disabled', 'true', { timeout: WAITING_TIMEOUT_MS });
  await expect(offlineButton).toHaveAccessibleDescription(offlineMemberReason(BRUNO));
});

test('a document opened before its owner syncs it shows the waiting page and enters on its own', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: anaUser! });
  const bruno = await signedInContext({ browser, user: brunoUser! });
  const created = await ana.page.request.post(ApiPath.Documents, { data: { title: uniqueTitle() } });
  const { id: documentId } = (await created.json()) as DocumentSummary;
  await acceptShareLink({ page: bruno.page, documentId, role: ShareLinkRole.Read, owner: ana.page });
  await expect(bruno.page.getByText(PREPARING_DOCUMENT_MESSAGE)).toBeVisible();
  await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).toHaveCount(0);
  await ana.page.goto(documentPagePath(documentId));
  await expect(ana.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
  await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).toBeVisible({ timeout: WAITING_TIMEOUT_MS });
  await expect(bruno.page.getByText(PREPARING_DOCUMENT_MESSAGE)).toHaveCount(0);
});

test('Use with AI opens a dialog with a tab per client, fewer prompts for a reader, and returns focus', async ({ browser }) => {
  const { ana, title, documentId } = await ownerOpensDocument({ browser });
  const caio = await signedInContext({ browser, user: caioUser! });
  await shareAndAccept({ owner: ana.page, member: caio.page, documentId, role: ShareLinkRole.Read });
  const editorPrompts = documentPrompts({ title, canEdit: true });
  const readerPrompts = documentPrompts({ title, canEdit: false });
  const people = [
    { page: ana.page, prompts: editorPrompts },
    { page: caio.page, prompts: readerPrompts },
  ];
  await Promise.all(
    people.map(async ({ page, prompts }) => {
      const trigger = page.getByRole('button', { name: USE_WITH_AI_LABEL });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: USE_WITH_AI_TITLE });
      await expect(dialog).toBeVisible();
      for (const client of Object.values(McpClient)) {
        const tab = dialog.getByRole('tab', { name: MCP_CLIENT_LABELS[client] });
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
      }
      await Promise.all(prompts.map((prompt) => expect(dialog.getByText(prompt)).toBeVisible()));
      await Promise.all(
        editorPrompts.filter((prompt) => !prompts.includes(prompt)).map((prompt) => expect(dialog.getByText(prompt)).toHaveCount(0)),
      );
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }),
  );
});

test('the top bar fits between 640 and 1023 px with two members and keeps a readable title', async ({ browser }) => {
  const { ana, title, documentId } = await ownerOpensDocument({ browser, recordsTopBar: true });
  const bruno = await signedInContext({ browser, user: brunoUser! });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  for (const width of TWO_MEMBER_WIDTHS) {
    await ana.page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await expectChromeFits({ page: ana.page, name: anaUser!.name });
    const titleBox = await titleButton({ page: ana.page, title }).boundingBox();
    expect(titleBox!.width).toBeGreaterThanOrEqual(MINIMUM_TITLE_WIDTH_PX);
  }
});

test('the top bar fits at 640 px with five members and keeps a readable title', async ({ browser }) => {
  const { ana, title, documentId } = await ownerOpensDocument({ browser, recordsTopBar: true });
  const otherMembers = [brunoUser!, caioUser!, daniUser!, DEMO_ADMIN];
  for (const user of otherMembers) {
    const member = await signedInContext({ browser, user });
    await shareAndAccept({ owner: ana.page, member: member.page, documentId, role: ShareLinkRole.Edit });
  }
  await ana.page.setViewportSize({ width: FIVE_MEMBER_WIDTH, height: VIEWPORT_HEIGHT });
  await expectChromeFits({ page: ana.page, name: anaUser!.name });
  const titleBox = await titleButton({ page: ana.page, title }).boundingBox();
  expect(titleBox!.width).toBeGreaterThanOrEqual(MINIMUM_FIVE_MEMBER_TITLE_WIDTH_PX);
});

for (const width of VIEWPORT_WIDTHS) {
  test(`the editor chrome fits ${width} px in light and dark with no layout jump`, async ({ browser }) => {
    const ana = await signedInContext({ browser, user: anaUser! });
    await ana.page.addInitScript(recordTopBarTops, TOP_BAR_SELECTOR);
    await openDocument({ page: ana.page, title: uniqueTitle(), viewport: { width, height: VIEWPORT_HEIGHT } });
    await ana.page.reload();
    await expect(ana.page.locator(PAGE_SELECTOR).first()).toBeVisible({ timeout: WAITING_TIMEOUT_MS });
    await expectChromeFits({ page: ana.page, name: anaUser!.name });
    await expectPageFitsEditor({ page: ana.page, width });
    await chooseTheme({ page: ana.page, name: anaUser!.name, theme: ThemePreference.Dark });
    await expect(ana.page.locator('html')).toHaveClass(DARK_CLASS_PATTERN);
    await expectChromeFits({ page: ana.page, name: anaUser!.name });
  });
}
