import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { AppRoute, DEMO_USERS, DOCX_MIME_TYPE, ShareLinkRole } from '../libs/types/src';
import { FILE_INPUT_LABEL } from '../apps/web/src/features/documents/documents-copy';
import { PREPARING_HERE_DETAIL, preparedOnDeviceDetail } from '../apps/web/src/features/open-progress/open-progress-copy';
import { EDITOR_READY_TIMEOUT_MS, acceptShareLink, editorText, insertInParagraph, openDocumentFileInput } from './editor';
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

type Sample = { hasPanel: boolean; hasText: boolean; hasPreview: boolean; detail: string | null };

async function recordPageLife(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, panelId, detailId, previewId, textSelector, intervalMs }) => {
      const samples: Sample[] = [];
      (window as unknown as Record<string, Sample[]>)[key] = samples;
      setInterval(() => {
        const detail = document.querySelector(`[data-testid="${detailId}"]`);
        samples.push({
          hasPanel: document.querySelector(`[data-testid="${panelId}"]`) !== null,
          hasText: document.querySelector(textSelector) !== null,
          hasPreview: document.querySelector(`[data-testid="${previewId}"]`) !== null,
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
      intervalMs: SAMPLE_INTERVAL_MS,
    },
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
  await recordPageLife(ana.page);
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
  await expect(ana.page.getByTestId(PANEL_DETAIL_TEST_ID)).toContainText(PREPARING_HERE_DETAIL);
  await expect(ana.page.getByTestId(PANEL_DETAIL_TEST_ID)).toContainText('about');
  await expect(ana.page.getByTestId(PANEL_TEST_ID)).toHaveCount(0, { timeout: EDITABLE_TIMEOUT_MS });
  const editableMs = Date.now() - startedAt;
  await expect(editorText(ana.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible();
  await insertInParagraph({ page: ana.page, paragraphText: LARGE_PARAGRAPH, text: TYPED_TEXT });
  await expect(editorText(ana.page).filter({ hasText: TYPED_TEXT.trim() }).first()).toBeVisible();
  await expect(editorText(bruno.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: EDITABLE_TIMEOUT_MS });
  const joinerTextMs = Date.now() - startedAt;
  const samples = await samplesOf(ana.page);
  const firstPanel = samples.findIndex((sample) => sample.hasPanel);
  const afterFirstPanel = samples.slice(firstPanel);
  test.info().annotations.push({
    type: 'measured',
    description: JSON.stringify({ editableMs, joinerTextMs, samples: samples.length }),
  });
  expect(firstPanel).toBeGreaterThanOrEqual(0);
  expect(samples.some((sample) => sample.hasPreview)).toBe(false);
  expect(afterFirstPanel.some((sample) => !sample.hasPanel && !sample.hasText)).toBe(false);
  expect(editableMs).toBeLessThan(MAX_EDITABLE_MS);
  await expect(bruno.page.getByTestId(PANEL_TEST_ID)).toHaveCount(0, { timeout: EDITOR_READY_TIMEOUT_MS });
});
