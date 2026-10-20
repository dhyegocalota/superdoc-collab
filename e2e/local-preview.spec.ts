import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Worker } from '@playwright/test';
import {
  AppRoute,
  BootstrapStage,
  bootstrapMemoryShortMessage,
  BOOTSTRAP_MEMORY_RESERVE_MEGABYTES,
  DEMO_USERS,
  DOCX_MIME_TYPE,
  documentApiPath,
  largestHoldableMegabytes,
  roomHeapBudgetMegabytes,
  roomHoldShortMessage,
  RoomMode,
  ShareLinkRole,
  type BootstrapProgress,
  type OpenedDocument,
} from '../libs/types/src';
import { buildSeedDocx } from '../libs/history/src';
import { FILE_INPUT_LABEL } from '../apps/web/src/features/documents/documents-copy';
import { DEVICE_REFUSAL_COPY, DEVICE_OFFER_LABEL, PREVIEW_BADGE_MESSAGE } from '../apps/web/src/features/local-preview/local-preview-copy';
import { EDITOR_READY_TIMEOUT_MS, TEXT_RUN_SELECTOR, acceptShareLink, editorText, openDocumentFileInput } from './editor';
import { buildLargeDocx } from './fixtures/large-docx';
import { expect, signedInContext, test } from './fixtures';
import { DeviceRefusal } from '../apps/web/src/features/local-preview/device-guard';
import { preparedOnDeviceDetail } from '../apps/web/src/features/open-progress/open-progress-copy';
import { peakIn, startTabMemorySampler } from './tab-memory';
import { scriptNextOpenAnswers } from './open-answers';
import { RestartablePort, startRestartableStack, stopRestartableStack } from './restartable-stack';
import { serverHeapMegabytesOf } from './stack';

const PREVIEW_SURFACE_TEST_ID = 'local-preview';
const LIVE_EDITOR_TEST_ID = 'document-editor';
const PANEL_DETAIL_TEST_ID = 'open-progress-detail';
const DOCUMENT_URL_PATTERN = /\/documents\/([^/?#]+)/;
const SEED_PARAGRAPH = 'Paragraph read from the preview.';
const LARGE_PARAGRAPH = 'Large document paragraph.';
const DEVICE_PARAGRAPH = 'Paragraph prepared on the device.';
const SCRIPTED_TOTAL_BYTES = 1_000_000;
const SCRIPTED_PREPARING_ANSWERS = 12;
const PREVIEW_PAINT_TIMEOUT_MS = 30_000;
const SWAP_TIMEOUT_MS = 60_000;
const LARGE_TEST_TIMEOUT_MS = 600_000;
const LARGE_PREVIEW_TIMEOUT_MS = 240_000;
const LARGE_SWAP_TIMEOUT_MS = 300_000;
const HEARTBEAT_INTERVAL_MS = 100;
const HEARTBEATS_KEY = 'previewHeartbeats';
const DETAILS_KEY = 'previewPanelDetails';
const TEXT_SAMPLES_KEY = 'previewTextSamples';
const VISIBLE_TEXT_SELECTOR = '[data-testid="local-preview"] .superdoc-text-run, [data-testid="document-editor"] .superdoc-text-run';
const TEXT_GAP_LIMIT_MS = 1_000;
const LIVE_ALONE_SAMPLING_MS = 5_000;
const LONGEST_STALL_LIMIT_MS = 5_000;
const LONGEST_LAYOUT_STALL_LIMIT_MS = 10_000;
const MIN_DISTINCT_DETAILS = 3;
const MARKER_KEY = 'previewMarker';
const BRIEF_PATH = resolve('docs/brief/superdoc-eng-sample-project.docx');
const BRIEF_PREVIEW_LIMIT_MS = 3_000;
const LARGE_PREVIEW_LIMIT_MS = 42_000;
const DOCUMENT_WORKER_PATTERN = /browser-worker-entry/;
const NARROW_VIEWPORT = { width: 375, height: 812 };
const DEVICE_JOINER_TIMEOUT_MS = 120_000;
const FOUR_GIGABYTES = 4096;
const SIX_GIGABYTES = 6144;
const ROOMY_HEAP_BUDGET_MEGABYTES = 2000;

function preparingAnswer(): BootstrapProgress {
  return {
    stage: BootstrapStage.Preparing,
    done: 0,
    total: SCRIPTED_TOTAL_BYTES,
    stateBytes: null,
    estimatedMs: null,
    documentXmlBytes: SCRIPTED_TOTAL_BYTES,
    preparingElapsedMs: null,
    queuePosition: null,
    queueWaitMs: null,
  };
}

async function uploadThroughTheDialog({ page, buffer }: { page: Page; buffer: Buffer }): Promise<void> {
  await page.goto(AppRoute.Documents);
  await openDocumentFileInput(page);
  await page
    .getByLabel(FILE_INPUT_LABEL)
    .setInputFiles({ name: `preview-${randomUUID().slice(0, 8)}.docx`, mimeType: DOCX_MIME_TYPE, buffer });
}

async function uploadSeedWhilePreparing(page: Page): Promise<void> {
  await scriptNextOpenAnswers({ page, bootstraps: Array.from({ length: SCRIPTED_PREPARING_ANSWERS }, preparingAnswer) });
  const buffer = await buildSeedDocx([{ text: SEED_PARAGRAPH, trackedChanges: [] }]);
  await uploadThroughTheDialog({ page, buffer });
  await expect(page).toHaveURL(DOCUMENT_URL_PATTERN);
}

function previewText(page: Page, text: string) {
  return page.getByTestId(PREVIEW_SURFACE_TEST_ID).locator(TEXT_RUN_SELECTOR).filter({ hasText: text }).first();
}

async function recordPageLife(page: Page): Promise<void> {
  await page.addInitScript(
    ({ heartbeatsKey, detailsKey, textKey, textSelector, intervalMs, detailTestId }) => {
      const scope = window as unknown as Record<string, unknown[]>;
      scope[heartbeatsKey] = [];
      scope[detailsKey] = [];
      scope[textKey] = [];
      setInterval(() => {
        scope[heartbeatsKey]!.push(performance.now());
        scope[textKey]!.push(document.querySelector(textSelector) !== null);
        const detail = document.querySelector(`[data-testid="${detailTestId}"]`);
        if (!detail) return;
        const text = detail.textContent;
        if (scope[detailsKey]!.at(-1) !== text) scope[detailsKey]!.push(text);
      }, intervalMs);
    },
    {
      heartbeatsKey: HEARTBEATS_KEY,
      detailsKey: DETAILS_KEY,
      textKey: TEXT_SAMPLES_KEY,
      textSelector: VISIBLE_TEXT_SELECTOR,
      intervalMs: HEARTBEAT_INTERVAL_MS,
      detailTestId: PANEL_DETAIL_TEST_ID,
    },
  );
}

async function pageLifeOf(page: Page): Promise<{ heartbeats: number[]; details: string[]; textSamples: boolean[] }> {
  return page.evaluate(
    ({ heartbeatsKey, detailsKey, textKey }) => {
      const scope = window as unknown as Record<string, unknown[]>;
      return {
        heartbeats: scope[heartbeatsKey] as number[],
        details: scope[detailsKey] as string[],
        textSamples: scope[textKey] as boolean[],
      };
    },
    { heartbeatsKey: HEARTBEATS_KEY, detailsKey: DETAILS_KEY, textKey: TEXT_SAMPLES_KEY },
  );
}

function longestTextGapMs(textSamples: boolean[]): number {
  const firstText = textSamples.indexOf(true);
  if (firstText === -1) return Infinity;
  const gaps = textSamples
    .slice(firstText)
    .reduce<number[]>((runs, hasText) => (hasText ? [...runs, 0] : [...runs.slice(0, -1), runs.at(-1)! + 1]), [0]);
  return Math.max(...gaps) * HEARTBEAT_INTERVAL_MS;
}

function longestGapOf(heartbeats: number[]): number {
  return heartbeats.reduce((longest, beat, index) => (index === 0 ? longest : Math.max(longest, beat - heartbeats[index - 1]!)), 0);
}

test('the uploader reads the document in a preview before the shared copy is ready', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await uploadSeedWhilePreparing(ana.page);
  await expect(ana.page.getByText(PREVIEW_BADGE_MESSAGE)).toBeVisible();
  await expect(previewText(ana.page, SEED_PARAGRAPH)).toBeVisible({ timeout: PREVIEW_PAINT_TIMEOUT_MS });
  await expect(ana.page.getByTestId(LIVE_EDITOR_TEST_ID)).toHaveCount(0);
  await expect(ana.page.getByTestId(PREVIEW_SURFACE_TEST_ID)).toHaveCount(0, { timeout: SWAP_TIMEOUT_MS });
  await expect(editorText(ana.page).filter({ hasText: SEED_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
});

test('the page swaps to the live room without a reload and without a moment with no text on screen', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await recordPageLife(ana.page);
  await uploadSeedWhilePreparing(ana.page);
  await expect(previewText(ana.page, SEED_PARAGRAPH)).toBeVisible({ timeout: PREVIEW_PAINT_TIMEOUT_MS });
  const timeOrigin = await ana.page.evaluate((key) => {
    const marked = performance.timeOrigin;
    (window as unknown as Record<string, number>)[key] = marked;
    return marked;
  }, MARKER_KEY);
  await expect(ana.page.getByTestId(PREVIEW_SURFACE_TEST_ID)).toHaveCount(0, { timeout: SWAP_TIMEOUT_MS });
  await expect(editorText(ana.page).filter({ hasText: SEED_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  const afterSwap = await ana.page.evaluate(
    (key) => ({ marker: (window as unknown as Record<string, number>)[key], origin: performance.timeOrigin }),
    MARKER_KEY,
  );
  expect(afterSwap).toEqual({ marker: timeOrigin, origin: timeOrigin });
  expect(longestTextGapMs((await pageLifeOf(ana.page)).textSamples)).toBeLessThanOrEqual(TEXT_GAP_LIMIT_MS);
});

test('the brief opens in a preview within seconds', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await scriptNextOpenAnswers({ page: ana.page, bootstraps: Array.from({ length: SCRIPTED_PREPARING_ANSWERS }, preparingAnswer) });
  await ana.page.goto(AppRoute.Documents);
  await openDocumentFileInput(ana.page);
  const workerUrls: string[] = [];
  ana.page.on('worker', (worker) => workerUrls.push(worker.url()));
  const startedAt = Date.now();
  await ana.page
    .getByLabel(FILE_INPUT_LABEL)
    .setInputFiles({ name: 'brief.docx', mimeType: DOCX_MIME_TYPE, buffer: readFileSync(BRIEF_PATH) });
  await expect(ana.page.getByTestId(PREVIEW_SURFACE_TEST_ID).locator(TEXT_RUN_SELECTOR).first()).toBeVisible({
    timeout: PREVIEW_PAINT_TIMEOUT_MS,
  });
  const previewMs = Date.now() - startedAt;
  test.info().annotations.push({ type: 'measured', description: JSON.stringify({ previewMs, workerUrls }) });
  expect(previewMs).toBeLessThan(BRIEF_PREVIEW_LIMIT_MS);
});

test('the preview of a large document opens while the panel keeps counting and the tab keeps answering', async ({ browser }) => {
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  await recordPageLife(ana.page);
  const workers: Worker[] = [];
  ana.page.on('worker', (worker) => workers.push(worker));
  const stopSampling = await startTabMemorySampler({ browser, page: ana.page });
  const startedAt = Date.now();
  await uploadThroughTheDialog({ page: ana.page, buffer: buildLargeDocx(LARGE_PARAGRAPH) });
  await expect(previewText(ana.page, LARGE_PARAGRAPH)).toBeVisible({ timeout: LARGE_PREVIEW_TIMEOUT_MS });
  const previewMs = Date.now() - startedAt;
  const previewVisibleAt = Date.now();
  const workerUrls = workers.map((worker) => worker.url());
  const documentWorker = workers.find((worker) => DOCUMENT_WORKER_PATTERN.test(worker.url()));
  expect(documentWorker).toBeDefined();
  expect(await documentWorker!.evaluate(() => typeof window === 'undefined')).toBe(true);
  const painted = await pageLifeOf(ana.page);
  const stallUntilFirstParagraphMs = longestGapOf(painted.heartbeats);
  await expect(ana.page.getByTestId(LIVE_EDITOR_TEST_ID)).toBeAttached({ timeout: LARGE_SWAP_TIMEOUT_MS });
  const liveMountedAt = Date.now();
  await expect(ana.page.getByTestId(PREVIEW_SURFACE_TEST_ID)).toHaveCount(0, { timeout: LARGE_SWAP_TIMEOUT_MS });
  const previewGoneAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, LIVE_ALONE_SAMPLING_MS));
  const samples = stopSampling();
  const memory = {
    previewAloneMegabytes: peakIn({ samples, from: previewVisibleAt, to: liveMountedAt }),
    overlapMegabytes: peakIn({ samples, from: liveMountedAt, to: previewGoneAt }),
    liveAloneMegabytes: peakIn({ samples, from: previewGoneAt, to: Date.now() }),
    overlapMs: previewGoneAt - liveMountedAt,
  };
  const swapped = await pageLifeOf(ana.page);
  const stallWhileLayingOutMs = longestGapOf(swapped.heartbeats.slice(painted.heartbeats.length - 1));
  test.info().annotations.push({
    type: 'measured',
    description: JSON.stringify({
      previewMs,
      stallUntilFirstParagraphMs,
      stallWhileLayingOutMs,
      distinctDetails: painted.details.length,
      workerUrls,
      memory,
    }),
  });
  expect(previewMs).toBeLessThan(LARGE_PREVIEW_LIMIT_MS);
  expect(longestTextGapMs(swapped.textSamples)).toBeLessThanOrEqual(TEXT_GAP_LIMIT_MS);
  expect(painted.details.length).toBeGreaterThanOrEqual(MIN_DISTINCT_DETAILS);
  expect(stallUntilFirstParagraphMs).toBeLessThan(LONGEST_STALL_LIMIT_MS);
  expect(stallWhileLayingOutMs).toBeLessThan(LONGEST_LAYOUT_STALL_LIMIT_MS);
  const documentUrl = ana.page.url();
  await ana.context.close();
  const fresh = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const stopFreshSampling = await startTabMemorySampler({ browser, page: fresh.page });
  const freshOpenedAt = Date.now();
  await fresh.page.goto(documentUrl);
  await expect(editorText(fresh.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_SWAP_TIMEOUT_MS });
  await new Promise((resolve) => setTimeout(resolve, LIVE_ALONE_SAMPLING_MS));
  const liveOnly = peakIn({ samples: stopFreshSampling(), from: freshOpenedAt, to: Date.now() });
  test.info().annotations.push({ type: 'measured-without-preview', description: JSON.stringify(liveOnly) });
});

test.describe('a server with no memory to prepare a file', () => {
  test.describe.configure({ mode: 'serial' });
  let origin: string;

  test.beforeAll(async () => {
    origin = await startRestartableStack({
      port: RestartablePort.LocalPreview,
      overrides: {
        MEMORY_LIMIT_MEGABYTES: String(BOOTSTRAP_MEMORY_RESERVE_MEGABYTES),
        ROOM_HEAP_BUDGET_MEGABYTES: String(ROOMY_HEAP_BUDGET_MEGABYTES),
      },
    });
  });

  test.afterAll(async () => {
    await stopRestartableStack();
  });

  test('is prepared on the owner device, then joined by the next person', async ({ browser }) => {
    const ana = await signedInContext({ browser, user: DEMO_USERS[0]!, origin });
    const bruno = await signedInContext({ browser, user: DEMO_USERS[1]!, origin });
    const buffer = await buildSeedDocx([{ text: DEVICE_PARAGRAPH, trackedChanges: [] }]);
    await uploadThroughTheDialog({ page: ana.page, buffer });
    await expect(ana.page.getByRole('alert')).toHaveText(bootstrapMemoryShortMessage(0));
    await ana.page.getByRole('button', { name: DEVICE_OFFER_LABEL }).click();
    await expect(ana.page).toHaveURL(DOCUMENT_URL_PATTERN);
    const documentId = DOCUMENT_URL_PATTERN.exec(ana.page.url())![1]!;
    await expect(editorText(ana.page).filter({ hasText: DEVICE_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
    await expect
      .poll(async () => {
        const opened = (await (await ana.page.request.get(documentApiPath({ documentId }))).json()) as OpenedDocument;
        return [opened.roomMode, opened.bootstrap.stage];
      })
      .toEqual([RoomMode.Join, BootstrapStage.Ready]);
    await acceptShareLink({ page: bruno.page, documentId, role: ShareLinkRole.Edit, owner: ana.page });
    await expect(editorText(bruno.page).filter({ hasText: DEVICE_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  });

  test('is not offered the device on a narrow viewport, with the reason instead', async ({ browser }) => {
    const ana = await signedInContext({ browser, user: DEMO_USERS[0]!, origin });
    await ana.page.setViewportSize(NARROW_VIEWPORT);
    const buffer = await buildSeedDocx([{ text: DEVICE_PARAGRAPH, trackedChanges: [] }]);
    await uploadThroughTheDialog({ page: ana.page, buffer });
    await expect(ana.page.getByRole('alert')).toHaveText(bootstrapMemoryShortMessage(0));
    await expect(ana.page.getByText(DEVICE_REFUSAL_COPY[DeviceRefusal.NarrowViewport])).toBeVisible();
    await expect(ana.page.getByRole('button', { name: DEVICE_OFFER_LABEL })).toHaveCount(0);
  });
});

test.describe('a four gigabyte server and the heavy fixture', () => {
  test.describe.configure({ mode: 'serial' });
  let origin: string;

  test.beforeAll(async () => {
    origin = await startRestartableStack({
      port: RestartablePort.LocalPreview,
      overrides: { MEMORY_LIMIT_MEGABYTES: String(FOUR_GIGABYTES) },
    });
  });

  test.afterAll(async () => {
    await stopRestartableStack();
  });

  test('cannot hold the document by any path, so the refusal names the largest size and offers no device', async ({ browser }) => {
    const ana = await signedInContext({ browser, user: DEMO_USERS[0]!, origin });
    await uploadThroughTheDialog({ page: ana.page, buffer: buildLargeDocx(LARGE_PARAGRAPH) });
    const roomHeapMegabytes = roomHeapBudgetMegabytes({
      memoryLimitMegabytes: FOUR_GIGABYTES,
      serverHeapMegabytes: serverHeapMegabytesOf(FOUR_GIGABYTES),
    })!;
    await expect(ana.page.getByRole('alert')).toHaveText(roomHoldShortMessage(largestHoldableMegabytes(roomHeapMegabytes)));
    await expect(ana.page.getByRole('button', { name: DEVICE_OFFER_LABEL })).toHaveCount(0);
  });
});

test.describe('a six gigabyte server and the heavy fixture', () => {
  test.describe.configure({ mode: 'serial' });
  let origin: string;

  test.beforeAll(async () => {
    origin = await startRestartableStack({
      port: RestartablePort.LocalPreview,
      overrides: { MEMORY_LIMIT_MEGABYTES: String(SIX_GIGABYTES) },
    });
  });

  test.afterAll(async () => {
    await stopRestartableStack();
  });

  test('is announced to a joiner as prepared on the owner device until it is committed', async ({ browser }) => {
    test.setTimeout(LARGE_TEST_TIMEOUT_MS);
    const ana = await signedInContext({ browser, user: DEMO_USERS[0]!, origin });
    const bruno = await signedInContext({ browser, user: DEMO_USERS[1]!, origin });
    await uploadThroughTheDialog({ page: ana.page, buffer: buildLargeDocx(LARGE_PARAGRAPH) });
    await ana.page.getByRole('button', { name: DEVICE_OFFER_LABEL }).click();
    await expect(ana.page).toHaveURL(DOCUMENT_URL_PATTERN);
    const documentId = DOCUMENT_URL_PATTERN.exec(ana.page.url())![1]!;
    await acceptShareLink({ page: bruno.page, documentId, role: ShareLinkRole.Edit, owner: ana.page });
    await expect(bruno.page.getByText(preparedOnDeviceDetail(DEMO_USERS[0]!.name))).toBeVisible({ timeout: DEVICE_JOINER_TIMEOUT_MS });
    await expect(editorText(bruno.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_SWAP_TIMEOUT_MS });
  });
});
