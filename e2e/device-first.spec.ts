import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  ApiPath,
  AppRoute,
  DEMO_USERS,
  DOCX_MIME_TYPE,
  documentPagePath,
  PREPARATION_FIELD,
  PreparationSource,
  ShareLinkRole,
  UPLOAD_FIELD,
} from '../libs/types/src';
import { FILE_INPUT_LABEL } from '../apps/web/src/features/documents/documents-copy';
import {
  MAXIMIZE_PROGRESS_LABEL,
  MINIMIZE_PROGRESS_LABEL,
  OPEN_STAGE_LABELS,
  PREPARING_HERE_DETAIL,
  preparedOnDeviceDetail,
} from '../apps/web/src/features/open-progress/open-progress-copy';
import { OpenStage } from '../apps/web/src/features/open-progress/open-stage';
import {
  EDITOR_READY_TIMEOUT_MS,
  TEXT_RUN_SELECTOR,
  acceptShareLink,
  editorText,
  insertInParagraph,
  openDocumentFileInput,
  sameOriginHeaders,
} from './editor';
import { peakIn, startTabMemorySampler } from './tab-memory';
import { buildLargeDocx } from './fixtures/large-docx';
import { expect, signedInContext, test } from './fixtures';

const PANEL_TEST_ID = 'open-progress';
const PANEL_DETAIL_TEST_ID = 'open-progress-detail';
const PREVIEW_TEST_ID = 'local-preview';
const LIVE_EDITOR_TEXT_SELECTOR = '[data-testid="document-editor"] .superdoc-text-run';
const DOCUMENT_URL_PATTERN = /\/documents\/([^/?#]+)/;
const LARGE_PARAGRAPH = 'Large document paragraph.';
const TYPED_TEXT = ' typed right after the panel left';
const TEST_TIMEOUT_MS = 600_000;
const EDITABLE_TIMEOUT_MS = 300_000;
const SAMPLE_INTERVAL_MS = 100;
const SAMPLES_KEY = 'deviceFirstSamples';
const MAX_EDITABLE_MS = 120_000;
const SETTLE_SAMPLING_MS = 3000;
const PREVIEW_CAPABLE_DEVICE_MEMORY_GIGABYTES = 8;

type Sample = { at: number; hasPanel: boolean; hasLiveText: boolean; hasPreviewText: boolean; hasText: boolean; detail: string | null };

async function recordPageLife(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, panelId, detailId, previewId, textSelector, previewTextSelector, intervalMs }) => {
      const samples: Sample[] = [];
      (window as unknown as Record<string, Sample[]>)[key] = samples;
      setInterval(() => {
        const detail = document.querySelector(`[data-testid="${detailId}"]`);
        const hasLiveText = document.querySelector(textSelector) !== null;
        const hasPreviewText = document.querySelector(`[data-testid="${previewId}"] ${previewTextSelector}`) !== null;
        samples.push({
          at: Date.now(),
          hasPanel: document.querySelector(`[data-testid="${panelId}"]`) !== null,
          hasLiveText,
          hasPreviewText,
          hasText: hasLiveText || hasPreviewText,
          detail: detail === null ? null : detail.textContent,
        });
      }, intervalMs);
    },
    {
      key: SAMPLES_KEY,
      panelId: PANEL_TEST_ID,
      detailId: PANEL_DETAIL_TEST_ID,
      previewId: PREVIEW_TEST_ID,
      textSelector: LIVE_EDITOR_TEXT_SELECTOR,
      previewTextSelector: TEXT_RUN_SELECTOR,
      intervalMs: SAMPLE_INTERVAL_MS,
    },
  );
}

async function useCapableDevice(page: Page): Promise<void> {
  await page.addInitScript(
    (deviceMemory) => Object.defineProperty(navigator, 'deviceMemory', { get: () => deviceMemory }),
    PREVIEW_CAPABLE_DEVICE_MEMORY_GIGABYTES,
  );
}

async function samplesOf(page: Page): Promise<Sample[]> {
  return page.evaluate((key) => (window as unknown as Record<string, Sample[]>)[key]!, SAMPLES_KEY);
}

test('a heavy upload is prepared on the uploader device, the panel stays until the editor is usable, and a joiner follows', async ({
  browser,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  await useCapableDevice(ana.page);
  await recordPageLife(ana.page);
  const stopSampling = await startTabMemorySampler({ browser, page: ana.page });
  await ana.page.goto(AppRoute.Documents);
  await openDocumentFileInput(ana.page);
  const startedAt = Date.now();
  await ana.page.getByLabel(FILE_INPUT_LABEL).setInputFiles({
    name: `device-first-${randomUUID().slice(0, 8)}.docx`,
    mimeType: DOCX_MIME_TYPE,
    buffer: buildLargeDocx(LARGE_PARAGRAPH),
  });
  await expect(ana.page).toHaveURL(DOCUMENT_URL_PATTERN);
  const documentId = DOCUMENT_URL_PATTERN.exec(ana.page.url())![1]!;
  await acceptShareLink({ page: bruno.page, documentId, role: ShareLinkRole.Edit, owner: ana.page });
  await expect(bruno.page.getByText(preparedOnDeviceDetail(DEMO_USERS[0]!.name))).toBeVisible({ timeout: EDITABLE_TIMEOUT_MS });
  const panel = ana.page.getByTestId(PANEL_TEST_ID);
  await expect(ana.page.getByTestId(PANEL_DETAIL_TEST_ID)).toContainText(PREPARING_HERE_DETAIL);
  await expect(ana.page.getByTestId(PANEL_DETAIL_TEST_ID)).toContainText('about');
  await expect(ana.page.getByTestId(PREVIEW_TEST_ID).locator(TEXT_RUN_SELECTOR).first()).toBeVisible({ timeout: EDITABLE_TIMEOUT_MS });
  await ana.page.getByRole('button', { name: MINIMIZE_PROGRESS_LABEL }).click();
  await expect(panel).toHaveAttribute('data-minimized', 'true');
  await expect(panel).toContainText(OPEN_STAGE_LABELS[OpenStage.Preparing]);
  await expect(panel).toContainText('elapsed');
  await expect(panel.getByRole('listitem')).toHaveCount(0);
  await ana.page.getByRole('button', { name: MAXIMIZE_PROGRESS_LABEL }).click();
  await expect(panel).not.toHaveAttribute('data-minimized');
  await expect(panel.getByRole('listitem')).not.toHaveCount(0);
  await expect(ana.page.getByTestId(PANEL_TEST_ID)).toHaveCount(0, { timeout: EDITABLE_TIMEOUT_MS });
  const editableMs = Date.now() - startedAt;
  await expect(editorText(ana.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible();
  const typedAt = Date.now();
  await insertInParagraph({ page: ana.page, paragraphText: LARGE_PARAGRAPH, text: TYPED_TEXT });
  await expect(editorText(ana.page).filter({ hasText: TYPED_TEXT.trim() }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  const typedMs = Date.now() - typedAt;
  await expect(editorText(bruno.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: EDITABLE_TIMEOUT_MS });
  const joinerTextMs = Date.now() - startedAt;
  const editableAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, SETTLE_SAMPLING_MS));
  const memorySamples = stopSampling();
  const samples = await samplesOf(ana.page);
  const firstPanel = samples.findIndex((sample) => sample.hasPanel);
  const firstPreviewText = samples.findIndex((sample) => sample.hasPreviewText);
  const firstLiveText = samples.findIndex((sample) => sample.hasLiveText);
  const afterFirstPanel = samples.slice(firstPanel);
  const afterFirstPreviewText = samples.slice(firstPreviewText);
  const swappedAt = samples[firstLiveText]!.at;
  test.info().annotations.push({
    type: 'measured',
    description: JSON.stringify({
      editableMs,
      joinerTextMs,
      typedMs,
      previewTextMs: samples[firstPreviewText]!.at - startedAt,
      liveTextMs: swappedAt - startedAt,
      samples: samples.length,
      memory: {
        previewAndCreateOverlap: peakIn({ samples: memorySamples, from: startedAt, to: swappedAt }),
        afterSwapUntilUsable: peakIn({ samples: memorySamples, from: swappedAt, to: editableAt }),
      },
    }),
  });
  expect(firstPanel).toBeGreaterThanOrEqual(0);
  expect(firstPreviewText).toBeGreaterThanOrEqual(0);
  expect(firstLiveText).toBeGreaterThanOrEqual(0);
  expect(firstPreviewText).toBeLessThanOrEqual(firstLiveText);
  expect(afterFirstPanel.some((sample) => !sample.hasPanel && !sample.hasText)).toBe(false);
  expect(afterFirstPreviewText.some((sample) => !sample.hasText)).toBe(false);
  expect(editableMs).toBeLessThan(MAX_EDITABLE_MS);
  await expect(bruno.page.getByTestId(PANEL_TEST_ID)).toHaveCount(0, { timeout: EDITOR_READY_TIMEOUT_MS });
});

test('the Create editor alone, with no kept file and so no preview, converts the heavy upload', async ({ browser }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await ana.page.goto(AppRoute.Documents);
  const response = await ana.page.request.post(ApiPath.Documents, {
    headers: sameOriginHeaders(ana.page),
    multipart: {
      [UPLOAD_FIELD]: {
        name: `create-alone-${randomUUID().slice(0, 8)}.docx`,
        mimeType: DOCX_MIME_TYPE,
        buffer: buildLargeDocx(LARGE_PARAGRAPH),
      },
      [PREPARATION_FIELD]: PreparationSource.Device,
    },
  });
  expect(response.ok()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  const stopSampling = await startTabMemorySampler({ browser, page: ana.page });
  const openedAt = Date.now();
  await ana.page.goto(documentPagePath(id));
  await expect(editorText(ana.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: EDITABLE_TIMEOUT_MS });
  await expect(ana.page.getByTestId(PANEL_TEST_ID)).toHaveCount(0, { timeout: EDITABLE_TIMEOUT_MS });
  const usableAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, SETTLE_SAMPLING_MS));
  const createAlone = peakIn({ samples: stopSampling(), from: openedAt, to: Date.now() });
  test.info().annotations.push({ type: 'measured', description: JSON.stringify({ usableMs: usableAt - openedAt, createAlone }) });
});
