import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  ApiPath,
  AppRoute,
  BootstrapStage,
  DEMO_USERS,
  DOCX_MIME_TYPE,
  HttpMethod,
  HttpStatus,
  PERCENT_MULTIPLIER,
  ShareLinkRole,
  UPLOAD_FIELD,
  documentApiPath,
  documentPagePath,
  type BootstrapProgress,
  type DocumentSummary,
  type OpenedDocument,
} from '../libs/types/src';
import { buildSeedDocx } from '../libs/history/src';
import { QUEUED_DETAIL } from '../apps/web/src/features/open-progress/open-progress-copy';
import { EDITOR_OPEN_STAGES, OpenStage } from '../apps/web/src/features/open-progress/open-stage';
import { FILE_INPUT_LABEL } from '../apps/web/src/features/documents/documents-copy';
import { EDITOR_READY_TIMEOUT_MS, acceptShareLink, editorText, openDocumentFileInput, uploadDocument } from './editor';
import { buildLargeDocx } from './fixtures/large-docx';
import { expect, signedInContext, test } from './fixtures';

const PANEL_TEST_ID = 'open-progress';
const PANEL_DETAIL_TEST_ID = 'open-progress-detail';
const UPLOAD_TEST_ID = 'upload-progress';
const READINGS_KEY = 'openProgressReadings';
const READING_INTERVAL_MS = 100;
const SEED_PARAGRAPH = 'Paragraph written by the creator.';
const LARGE_PARAGRAPH = 'Large document paragraph.';
const LARGE_TEST_TIMEOUT_MS = 360_000;
const LARGE_COMMIT_TIMEOUT_MS = 180_000;
const SCRIPTED_TOTAL_BYTES = 1_000_000;
const SCRIPTED_STEP_TIMEOUT_MS = 15_000;
const UPLOAD_BYTES_PER_SECOND = 2_000_000;
const PAGES_SO_FAR_PATTERN = /([\d,]+) so far/;

type Reading = { testId: string; stage: string | null; detail: string; value: string | null };

function bootstrapAt({ stage, done }: { stage: BootstrapStage; done: number }): BootstrapProgress {
  return {
    stage,
    done,
    total: SCRIPTED_TOTAL_BYTES,
    stateBytes: null,
    estimatedMs: null,
    fileBytes: SCRIPTED_TOTAL_BYTES,
    preparingElapsedMs: null,
  };
}

async function scriptOpenAnswers({
  page,
  documentId,
  bootstraps,
}: {
  page: Page;
  documentId: string;
  bootstraps: BootstrapProgress[];
}): Promise<void> {
  const remaining = [...bootstraps];
  await page.route(`**${documentApiPath({ documentId })}`, async (route) => {
    if (route.request().method() !== HttpMethod.Get) return route.fallback();
    const scripted = remaining.shift();
    const real = await route.fetch();
    const body = (await real.json()) as OpenedDocument;
    if (scripted) return route.fulfill({ status: HttpStatus.Ok, json: { ...body, bootstrap: scripted } });
    return route.fulfill({ response: real });
  });
}

async function recordReadings(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, intervalMs, panelId, uploadId }) => {
      const readings: Reading[] = [];
      (window as unknown as Record<string, Reading[]>)[key] = readings;
      function read(testId: string): void {
        const panel = document.querySelector(`[data-testid="${testId}"]`);
        if (!panel) return;
        const detail = panel.querySelector(`[data-testid="${testId}-detail"]`);
        const bar = panel.querySelector('[role="progressbar"]');
        const reading = {
          testId,
          stage: panel.getAttribute('data-stage'),
          detail: detail ? (detail.textContent ?? '') : '',
          value: bar ? bar.getAttribute('aria-valuenow') : null,
        };
        const last = readings.at(-1);
        const isRepeat = last && JSON.stringify(last) === JSON.stringify(reading);
        if (!isRepeat) readings.push(reading);
      }
      setInterval(() => [panelId, uploadId].forEach(read), intervalMs);
    },
    { key: READINGS_KEY, intervalMs: READING_INTERVAL_MS, panelId: PANEL_TEST_ID, uploadId: UPLOAD_TEST_ID },
  );
}

async function readingsOf(page: Page): Promise<Reading[]> {
  return page.evaluate((key) => (window as unknown as Record<string, Reading[]>)[key]!, READINGS_KEY);
}

function stagesInOrder(readings: Reading[]): (string | null)[] {
  return readings
    .filter(({ testId }) => testId === PANEL_TEST_ID)
    .map(({ stage }) => stage)
    .filter((stage, index, all) => stage !== all[index - 1]);
}

function stageRanksOf(stages: (string | null)[]): number[] {
  return stages.map((stage) => EDITOR_OPEN_STAGES.indexOf(stage as OpenStage));
}

function pageCountsOf(readings: Reading[]): number[] {
  return readings.flatMap(({ detail }) => {
    const match = PAGES_SO_FAR_PATTERN.exec(detail);
    if (!match) return [];
    return [Number(match[1]!.replaceAll(',', ''))];
  });
}

function isNonDecreasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value >= values[index - 1]!);
}

test('the Preparing panel names the wait, then the file being converted, then fills with the bytes done', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const buffer = await buildSeedDocx([{ text: SEED_PARAGRAPH, trackedChanges: [] }]);
  const documentId = await uploadDocument({ page: ana.page, buffer });
  await scriptOpenAnswers({
    page: ana.page,
    documentId,
    bootstraps: [
      ...Array.from({ length: 3 }, () => bootstrapAt({ stage: BootstrapStage.Queued, done: 0 })),
      ...Array.from({ length: 3 }, () => bootstrapAt({ stage: BootstrapStage.Preparing, done: 0 })),
      ...Array.from({ length: 3 }, () => bootstrapAt({ stage: BootstrapStage.Preparing, done: SCRIPTED_TOTAL_BYTES * 0.4 })),
      bootstrapAt({ stage: BootstrapStage.Preparing, done: SCRIPTED_TOTAL_BYTES * 0.8 }),
    ],
  });
  await ana.page.goto(documentPagePath(documentId));
  const panel = ana.page.getByTestId(PANEL_TEST_ID);
  const detail = ana.page.getByTestId(PANEL_DETAIL_TEST_ID);
  const bar = panel.getByRole('progressbar');
  await expect(panel).toHaveAttribute('data-stage', OpenStage.Preparing);
  await expect(detail).toContainText(QUEUED_DETAIL, { timeout: SCRIPTED_STEP_TIMEOUT_MS });
  await expect(bar).not.toHaveAttribute('aria-valuenow');
  await expect(detail).toContainText('Converting a', { timeout: SCRIPTED_STEP_TIMEOUT_MS });
  await expect(bar).not.toHaveAttribute('aria-valuenow');
  await expect(bar).toHaveAttribute('aria-valuenow', String(0.4 * PERCENT_MULTIPLIER), { timeout: SCRIPTED_STEP_TIMEOUT_MS });
  await expect(detail).toContainText('Received');
  await expect(bar).toHaveAttribute('aria-valuenow', String(0.8 * PERCENT_MULTIPLIER), { timeout: SCRIPTED_STEP_TIMEOUT_MS });
  await expect(editorText(ana.page).filter({ hasText: SEED_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await expect(panel).toHaveCount(0);
});

test('a joiner of a large document watches the download tick and the panel leaves at the first paragraph', async ({ browser }) => {
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadDocument({ page: ana.page, buffer: buildLargeDocx(LARGE_PARAGRAPH) });
  await Promise.all([ana.page, bruno.page].map((page) => scriptOpenAnswers({ page, documentId, bootstraps: [] })));
  await ana.page.goto(documentPagePath(documentId));
  await expect(editorText(ana.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_COMMIT_TIMEOUT_MS });
  await recordReadings(bruno.page);
  await acceptShareLink({ page: bruno.page, documentId, role: ShareLinkRole.Edit, owner: ana.page });
  await expect(editorText(bruno.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_COMMIT_TIMEOUT_MS });
  await expect(bruno.page.getByTestId(PANEL_TEST_ID)).toHaveCount(0);
  const readings = await readingsOf(bruno.page);
  const stages = stagesInOrder(readings);
  expect(stages).toContain(OpenStage.Downloading);
  expect(stageRanksOf(stages)).toEqual([...stageRanksOf(stages)].sort((first, second) => first - second));
  expect(isNonDecreasing(pageCountsOf(readings))).toBe(true);
  expect(new Set(readings.map(({ detail }) => detail)).size).toBeGreaterThan(2);
});

test('uploading a large document fills the bar with the bytes sent before the page opens', async ({ browser }) => {
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const throttling = await ana.context.newCDPSession(ana.page);
  await throttling.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: UPLOAD_BYTES_PER_SECOND,
  });
  await recordReadings(ana.page);
  await ana.page.goto(AppRoute.Documents);
  await openDocumentFileInput(ana.page);
  await ana.page.getByLabel(FILE_INPUT_LABEL).setInputFiles({
    name: `progress-${randomUUID().slice(0, 8)}.docx`,
    mimeType: DOCX_MIME_TYPE,
    buffer: buildLargeDocx(LARGE_PARAGRAPH),
  });
  await expect(ana.page.getByTestId(UPLOAD_TEST_ID)).toBeVisible();
  await expect(ana.page).toHaveURL(/\/documents\/[^/?#]+/, { timeout: LARGE_COMMIT_TIMEOUT_MS });
  const uploadReadings = (await readingsOf(ana.page)).filter(({ testId }) => testId === UPLOAD_TEST_ID);
  const values = uploadReadings.flatMap(({ value }) => (value === null ? [] : [Number(value)]));
  expect(values.length).toBeGreaterThan(1);
  expect(isNonDecreasing(values)).toBe(true);
  expect(new Set(uploadReadings.map(({ detail }) => detail)).size).toBeGreaterThan(1);
});

test('a normal document opens without the panel ever showing', async ({ browser }) => {
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const buffer = await buildSeedDocx([{ text: SEED_PARAGRAPH, trackedChanges: [] }]);
  const documentId = await uploadDocument({ page: ana.page, buffer });
  await expect
    .poll(async () => ((await (await ana.page.request.get(documentApiPath({ documentId }))).json()) as OpenedDocument).bootstrap.stage, {
      timeout: LARGE_COMMIT_TIMEOUT_MS,
    })
    .toBe(BootstrapStage.Ready);
  await scriptOpenAnswers({ page: ana.page, documentId, bootstraps: [] });
  await recordReadings(ana.page);
  await ana.page.goto(documentPagePath(documentId));
  await expect(editorText(ana.page).filter({ hasText: SEED_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await expect(ana.page.getByTestId(PANEL_TEST_ID)).toHaveCount(0);
  expect(await readingsOf(ana.page)).toEqual([]);
});
