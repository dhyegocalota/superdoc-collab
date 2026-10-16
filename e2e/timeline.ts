import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { bandAriaLabel, VERSION_FRAME_TITLE } from '../apps/web/src/features/timeline/timeline-copy';
import { DocumentResource, documentApiPath, TimelineSearchParam, VersionResource, versionApiPath, type DocumentTimeline, type VersionMarks, type VersionText } from '../libs/types/src';
import { TEXT_RUN_SELECTOR } from './editor';

export const HIGHLIGHT_CLASS = 'superdoc-comment-highlight';
export const BANDS_TIMEOUT_MS = 60_000;
export const VERSION_TIMEOUT_MS = 60_000;
const LIVE_EDITOR_SELECTOR = '[data-testid="document-editor"]';
const BANNER_SELECTOR = '[data-testid="version-banner"]';
const SEQUENCE_ATTRIBUTE = 'data-sequence';
const VOLUME_PLACEHOLDER = 987654321;
const VOLUME_PATTERN = '\\d+';
const STABLE_SAMPLE_MS = 500;
const REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;
const VISIBLE_FRAME_SELECTOR = `iframe[title="${VERSION_FRAME_TITLE}"]:not([aria-hidden="true"])`;

function escapeRegex(text: string): string {
  return text.replace(REGEX_ESCAPE_PATTERN, '\\$&');
}

export function bandNamed({ page, name }: { page: Page; name: string }): Locator {
  const pattern = escapeRegex(bandAriaLabel({ name, volume: VOLUME_PLACEHOLDER })).replace(String(VOLUME_PLACEHOLDER), VOLUME_PATTERN);
  return page.getByLabel(new RegExp(`^${pattern}$`));
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
  return (await viewerFrame(page).locator(TEXT_RUN_SELECTOR).allTextContents()).join('');
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

export async function readVersionText({ page, documentId, sequence }: { page: Page; documentId: string; sequence: number }): Promise<string> {
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

export async function readTimeline({ page, documentId }: { page: Page; documentId: string }): Promise<DocumentTimeline> {
  const response = await page.request.get(documentApiPath({ documentId, resource: DocumentResource.Timeline }));
  return (await response.json()) as DocumentTimeline;
}

export async function readVersionMarks({ page, documentId }: { page: Page; documentId: string }): Promise<VersionMarks> {
  const response = await page.request.get(documentApiPath({ documentId, resource: DocumentResource.Versions }));
  return (await response.json()) as VersionMarks;
}

export async function waitForProjection({ page, documentId }: { page: Page; documentId: string }): Promise<void> {
  await expect.poll(async () => (await readTimeline({ page, documentId })).projection.isBehind, { timeout: VERSION_TIMEOUT_MS }).toBe(false);
}

export async function expectStableFor({ read, expected, durationMs }: { read: () => Promise<string>; expected: string; durationMs: number }): Promise<void> {
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
