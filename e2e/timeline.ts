import { expect, type APIRequestContext, type Browser, type FrameLocator, type Locator, type Page, type Response } from '@playwright/test';
import {
  bandAriaLabel,
  FILTER_LABEL,
  SELECTION_SUMMARY_HEADING,
  SUMMARIZE_EDITS_LABEL,
  VERSION_FRAME_TITLE,
} from '../apps/web/src/features/timeline/timeline-copy';
import {
  ApiPath,
  DEMO_USERS,
  DocumentResource,
  documentApiPath,
  HttpMethod,
  selectionSummaryApiPath,
  ShareLinkRole,
  TimelineQueryParam,
  TimelineSearchParam,
  VersionResource,
  versionApiPath,
  type DocumentTimeline,
  type SessionUser,
  type VersionMarks,
  type VersionText,
} from '../libs/types/src';
import { insertInParagraph, shareAndAccept, TEXT_RUN_SELECTOR, toolbarRow, uploadSeed } from './editor';
import { FAKE_OPENROUTER_ORIGIN } from './fake-openrouter-origin';
import { signedInContext } from './fixtures';

export const ANA = DEMO_USERS[0]!.name;
export const BRUNO = DEMO_USERS[1]!.name;
export const BUDGET = 'Budget';
export const HIRING = 'Hiring';
export const BUDGET_PARAGRAPH = 'Budget: the plan costs 10.';
export const HIRING_PARAGRAPH = 'Hiring: we add two people.';
export const ANA_TEXT = ' More money';
export const BRUNO_TEXT = ' A designer';
const FAKE_CALLS_PATH = '/calls';
const SETTLE_WINDOW_MS = 1_500;
export const HIGHLIGHT_CLASS = 'superdoc-comment-highlight';
export const BANDS_TIMEOUT_MS = 60_000;
export const VERSION_TIMEOUT_MS = 60_000;
const LIVE_EDITOR_SELECTOR = '[data-testid="document-editor"]';
const BANNER_SELECTOR = '[data-testid="version-banner"]';
const SEQUENCE_ATTRIBUTE = 'data-sequence';
export const DETACHED_VIEWER_TEXT = '<viewer frame detached>';
const DETACHED_FRAME_MESSAGE = 'Frame was detached';
const VOLUME_PLACEHOLDER = 987654321;
const VOLUME_PATTERN = '\\d+';
const SINGLE_CHARACTER_VOLUME = 1;
const STABLE_SAMPLE_MS = 500;
const REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;
const VISIBLE_FRAME_SELECTOR = `iframe[title="${VERSION_FRAME_TITLE}"]:not([aria-hidden="true"])`;

function escapeRegex(text: string): string {
  return text.replace(REGEX_ESCAPE_PATTERN, '\\$&');
}

export function bandNamed({ page, name }: { page: Page; name: string }): Locator {
  const many = escapeRegex(bandAriaLabel({ name, volume: VOLUME_PLACEHOLDER })).replace(String(VOLUME_PLACEHOLDER), VOLUME_PATTERN);
  const one = escapeRegex(bandAriaLabel({ name, volume: SINGLE_CHARACTER_VOLUME }));
  return page.getByLabel(new RegExp(`^(${many}|${one})$`));
}

export async function bandVolume({ page, name }: { page: Page; name: string }): Promise<number> {
  const label = await bandNamed({ page, name }).getAttribute('aria-label');
  return Number(new RegExp(VOLUME_PATTERN).exec(label!.slice(name.length))![0]);
}

export async function waitForBands({ page, names }: { page: Page; names: string[] }): Promise<void> {
  await Promise.all(names.map((name) => expect(bandNamed({ page, name })).toBeVisible({ timeout: BANDS_TIMEOUT_MS })));
}

export function viewerFrame(page: Page): FrameLocator {
  return page.frameLocator(VISIBLE_FRAME_SELECTOR);
}

export function versionBanner(page: Page): Locator {
  return page.locator(BANNER_SELECTOR);
}

export async function readViewerText(page: Page): Promise<string> {
  try {
    return (await viewerFrame(page).locator(TEXT_RUN_SELECTOR).allTextContents()).join('');
  } catch (error) {
    if (!String(error).includes(DETACHED_FRAME_MESSAGE)) throw error;
    return DETACHED_VIEWER_TEXT;
  }
}

export async function readLiveText(page: Page): Promise<string> {
  return (await page.locator(LIVE_EDITOR_SELECTOR).locator(TEXT_RUN_SELECTOR).allTextContents()).join('');
}

export function countViewerHighlights(frame: FrameLocator): Promise<number> {
  return frame.locator(`.${HIGHLIGHT_CLASS}`).count();
}

export function currentAt(page: Page): number | null {
  const value = new URL(page.url()).searchParams.get(TimelineSearchParam.At);
  if (value === null) return null;
  return Number(value);
}

export async function shownVersionSequence(page: Page): Promise<number> {
  const value = await versionBanner(page).getAttribute(SEQUENCE_ATTRIBUTE);
  if (value === null) throw new Error('The version banner shows no sequence');
  return Number(value);
}

export async function readVersionText({
  page,
  documentId,
  sequence,
}: {
  page: Page;
  documentId: string;
  sequence: number;
}): Promise<string> {
  const response = await page.request.get(versionApiPath({ documentId, sequence, resource: VersionResource.Text }));
  const { text } = (await response.json()) as VersionText;
  return text;
}

export async function pressInChart({ page, name, keys }: { page: Page; name: string; keys: string[] }): Promise<void> {
  await bandNamed({ page, name }).focus();
  for (const key of keys) await page.keyboard.press(key);
}

export async function ruleX(page: Page): Promise<number> {
  return Number(await page.locator('svg line.pointer-events-none').first().getAttribute('x1'));
}

export async function readAccountTimeZone(page: Page): Promise<string> {
  const response = await page.request.get(ApiPath.Me);
  expect(response.ok()).toBe(true);
  const { user } = (await response.json()) as { user: SessionUser };
  if (user.timeZone === null) throw new Error('The account has no time zone');
  return user.timeZone;
}

export async function readTimeline({ page, documentId }: { page: Page; documentId: string }): Promise<DocumentTimeline> {
  const path = documentApiPath({ documentId, resource: DocumentResource.Timeline });
  const timeZone = await readAccountTimeZone(page);
  const response = await page.request.get(`${path}?${TimelineQueryParam.TimeZone}=${encodeURIComponent(timeZone)}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as DocumentTimeline;
}

export async function readVersionMarks({ page, documentId }: { page: Page; documentId: string }): Promise<VersionMarks> {
  const path = documentApiPath({ documentId, resource: DocumentResource.Versions });
  const response = await page.request.get(`${path}?${TimelineQueryParam.Around}=${Number.MAX_SAFE_INTEGER}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as VersionMarks;
}

export async function waitForProjection({ page, documentId }: { page: Page; documentId: string }): Promise<void> {
  await expect
    .poll(async () => (await readTimeline({ page, documentId })).projection.isBehind, { timeout: VERSION_TIMEOUT_MS })
    .toBe(false);
}

export async function expectStableFor({
  read,
  expected,
  durationMs,
}: {
  read: () => Promise<string>;
  expected: string;
  durationMs: number;
}): Promise<void> {
  const deadline = Date.now() + durationMs;
  const observed = new Set<string>();
  await expect
    .poll(
      async () => {
        observed.add(await read());
        return Date.now() >= deadline;
      },
      { intervals: [STABLE_SAMPLE_MS], timeout: durationMs + VERSION_TIMEOUT_MS },
    )
    .toBe(true);
  expect([...observed]).toEqual([expected]);
}

export async function twoAuthorsInTwoTopics({ browser, paragraphs }: { browser: Browser; paragraphs: string[] }) {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await Promise.all([
    insertInParagraph({ page: ana.page, paragraphText: paragraphs[0]!.slice(0, 7), text: ANA_TEXT }),
    insertInParagraph({ page: bruno.page, paragraphText: paragraphs[1]!.slice(0, 7), text: BRUNO_TEXT }),
  ]);
  return { ana, bruno, documentId };
}

export async function filterBy({ page, text }: { page: Page; text: string }): Promise<void> {
  const input = page.getByRole('textbox', { name: FILTER_LABEL });
  await input.fill(text);
  await input.press('Enter');
}

export async function readSelectionCalls(request: APIRequestContext): Promise<number> {
  const response = await request.get(`${FAKE_OPENROUTER_ORIGIN}${FAKE_CALLS_PATH}`);
  return ((await response.json()) as { selection: number }).selection;
}

export function summaryCard(page: Page): Locator {
  return page.getByRole('region', { name: SELECTION_SUMMARY_HEADING });
}

export function waitForSummarizeResponse({ page, documentId }: { page: Page; documentId: string }): Promise<Response> {
  const summarizePath = selectionSummaryApiPath(documentId);
  return page.waitForResponse(
    (response) => response.request().method() === HttpMethod.Post && new URL(response.url()).pathname === summarizePath,
  );
}

export function summarizeButton(page: Page): Locator {
  return toolbarRow(page).getByRole('button', { name: SUMMARIZE_EDITS_LABEL });
}

async function timelineVolume({ page, documentId }: { page: Page; documentId: string }): Promise<string> {
  const { bins } = await readTimeline({ page, documentId });
  const volume = bins.flatMap((bin) => Object.values(bin.byBand)).reduce((total, cell) => total + cell.inserted + cell.deleted, 0);
  return String(volume);
}

export async function waitForSettledTimeline({ page, documentId }: { page: Page; documentId: string }): Promise<void> {
  await waitForProjection({ page, documentId });
  await expectStableFor({
    read: () => timelineVolume({ page, documentId }),
    expected: await timelineVolume({ page, documentId }),
    durationMs: SETTLE_WINDOW_MS,
  });
}
