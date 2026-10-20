import type { APIResponse, Page } from '@playwright/test';
import {
  AppRoute,
  BootstrapStage,
  DEMO_USERS,
  DOCX_MIME_TYPE,
  HEAVY_ROOMS_FULL_MESSAGE,
  HttpStatus,
  SECOND_MS,
  documentApiPath,
  documentPagePath,
  type OpenedDocument,
} from '../libs/types/src';
import { FILE_INPUT_LABEL } from '../apps/web/src/features/documents/documents-copy';
import { EDITOR_READY_TIMEOUT_MS, editorText, openDocumentFileInput, uploadDocument } from './editor';
import { buildLargeDocx } from './fixtures/large-docx';
import { expect, signedInContext, test } from './fixtures';
import { RestartablePort, startRestartableStack, stopRestartableStack } from './restartable-stack';

const [ana, bruno, carla] = DEMO_USERS;
const WAIT_CEILING_MS = 60 * SECOND_MS;
const ROOM_HEAP_BUDGET_MEGABYTES = 2100;
const LARGE_PARAGRAPH = 'Large document paragraph.';
const LARGE_TEST_TIMEOUT_MS = 480 * SECOND_MS;
const LARGE_READY_TIMEOUT_MS = 240 * SECOND_MS;
const QUEUE_LINE_TIMEOUT_MS = 30 * SECOND_MS;
const POLL_INTERVALS_MS = [500];
const PANEL_DETAIL_TEST_ID = 'open-progress-detail';
const ALERT_ROLE = 'alert';
const QUEUE_LINE_PATTERN = /1 document ahead · about \d+ (s|min)/;
const BUSY_MESSAGE_PATTERN = /The server is busy preparing other documents; try again in about \d+ min/;

let origin: string;
let firstId: string;
let secondId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  origin = await startRestartableStack({
    port: RestartablePort.Backpressure,
    overrides: { MAX_BOOTSTRAP_WAIT_MS: String(WAIT_CEILING_MS), ROOM_HEAP_BUDGET_MEGABYTES: String(ROOM_HEAP_BUDGET_MEGABYTES) },
  });
});

test.afterAll(async () => {
  await stopRestartableStack();
});

async function openStatus({ page, documentId }: { page: Page; documentId: string }): Promise<number> {
  return (await page.request.get(documentApiPath({ documentId }))).status();
}

async function openStage({ page, documentId }: { page: Page; documentId: string }): Promise<BootstrapStage | null> {
  const response: APIResponse = await page.request.get(documentApiPath({ documentId }));
  if (!response.ok()) return null;
  return ((await response.json()) as OpenedDocument).bootstrap.stage;
}

async function waitUntilReady({ page, documentId }: { page: Page; documentId: string }): Promise<void> {
  await expect
    .poll(() => openStage({ page, documentId }), { timeout: LARGE_READY_TIMEOUT_MS, intervals: POLL_INTERVALS_MS })
    .toBe(BootstrapStage.Ready);
}

test('a second heavy upload shows its place in the queue and a third past the wait ceiling is refused in the dialog', async ({
  browser,
}) => {
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const buffer = buildLargeDocx(LARGE_PARAGRAPH);
  const first = await signedInContext({ browser, user: ana!, origin });
  const second = await signedInContext({ browser, user: bruno!, origin });
  const third = await signedInContext({ browser, user: carla!, origin });
  firstId = await uploadDocument({ page: first.page, buffer });
  secondId = await uploadDocument({ page: second.page, buffer });
  await third.page.goto(AppRoute.Documents);
  await openDocumentFileInput(third.page);
  await third.page.getByLabel(FILE_INPUT_LABEL).setInputFiles({ name: 'third.docx', mimeType: DOCX_MIME_TYPE, buffer });
  await expect(third.page.getByRole(ALERT_ROLE)).toHaveText(BUSY_MESSAGE_PATTERN);
  await second.page.goto(documentPagePath(secondId));
  await expect(second.page.getByTestId(PANEL_DETAIL_TEST_ID)).toHaveText(QUEUE_LINE_PATTERN, { timeout: QUEUE_LINE_TIMEOUT_MS });
  await waitUntilReady({ page: first.page, documentId: firstId });
  await waitUntilReady({ page: second.page, documentId: secondId });
});

async function openInEditor({ page, documentId }: { page: Page; documentId: string }): Promise<void> {
  await expect
    .poll(() => openStatus({ page, documentId }), { timeout: EDITOR_READY_TIMEOUT_MS, intervals: POLL_INTERVALS_MS })
    .toBe(HttpStatus.Ok);
  await page.goto(documentPagePath(documentId));
  await expect(editorText(page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_READY_TIMEOUT_MS });
}

test('with two large rooms loaded, opening a third large document is refused with the message of the server', async ({ browser }) => {
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const firstHolder = await signedInContext({ browser, user: ana!, origin });
  const secondHolder = await signedInContext({ browser, user: bruno!, origin });
  const refused = await signedInContext({ browser, user: carla!, origin });
  const thirdId = await uploadDocument({ page: refused.page, buffer: buildLargeDocx(LARGE_PARAGRAPH) });
  await waitUntilReady({ page: refused.page, documentId: thirdId });
  await openInEditor({ page: firstHolder.page, documentId: firstId });
  await openInEditor({ page: secondHolder.page, documentId: secondId });
  await expect
    .poll(() => openStatus({ page: refused.page, documentId: thirdId }), { timeout: EDITOR_READY_TIMEOUT_MS, intervals: POLL_INTERVALS_MS })
    .toBe(HttpStatus.ServiceUnavailable);
  await refused.page.goto(documentPagePath(thirdId));
  await expect(refused.page.getByRole(ALERT_ROLE)).toContainText(HEAVY_ROOMS_FULL_MESSAGE);
});
