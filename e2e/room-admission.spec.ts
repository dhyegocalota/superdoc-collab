import { randomUUID } from 'node:crypto';
import type { APIResponse, Page } from '@playwright/test';
import {
  ApiPath,
  BootstrapStage,
  DEMO_USERS,
  DOCX_MIME_TYPE,
  HttpStatus,
  MAX_SOCKET_MESSAGE_BYTES,
  RoomMode,
  ShareLinkRole,
  UPLOAD_FIELD,
  documentApiPath,
  documentPagePath,
  shareLinkAcceptPath,
  type DocumentSummary,
  type OpenedDocument,
} from '../libs/types/src';
import { buildSeedDocx } from '../libs/history/src';
import { EDITOR_READY_TIMEOUT_MS, editorText, readEditorText, readShareLinks } from './editor';
import { buildBrokenDocx, buildLargeDocx } from './fixtures/large-docx';
import { expect, signedInContext, test } from './fixtures';

const EDITOR_TEST_ID = 'document-editor';
const ORIGIN_HEADER = 'origin';
const SEED_PARAGRAPH = 'Paragraph written by the server.';
const LARGE_PARAGRAPH = 'Large document paragraph.';
const READY_TIMEOUT_MS = 60_000;
const LARGE_READY_TIMEOUT_MS = 180_000;
const LARGE_TEST_TIMEOUT_MS = 360_000;
const STAGE_POLL_INTERVALS_MS = [250];
const BYTES_PER_MEGABYTE = 1024 * 1024;
const JOINER_SENT_BYTES_LIMIT = BYTES_PER_MEGABYTE;
const PROGRESS_STAGES = [BootstrapStage.Queued, BootstrapStage.Preparing];

type OpenAnswer = { status: number; roomMode: RoomMode | null; stage: BootstrapStage | null };

function occurrencesOf({ text, fragment }: { text: string; fragment: string }): number {
  return text.split(fragment).length - 1;
}

function uniqueFileName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}.docx`;
}

async function seedBuffer(paragraphs: string[]): Promise<Buffer> {
  return buildSeedDocx(paragraphs.map((text) => ({ text, trackedChanges: [] })));
}

function sameOriginHeaders(page: Page): Record<string, string> {
  return { [ORIGIN_HEADER]: new URL(page.url()).origin };
}

async function uploadDocument({ page, buffer }: { page: Page; buffer: Buffer }): Promise<string> {
  const response = await page.request.post(ApiPath.Documents, {
    headers: sameOriginHeaders(page),
    multipart: { [UPLOAD_FIELD]: { name: uniqueFileName('admission'), mimeType: DOCX_MIME_TYPE, buffer } },
  });
  expect(response.ok()).toBe(true);
  const { id } = (await response.json()) as DocumentSummary;
  return id;
}

async function shareWithEditor({ owner, member, documentId }: { owner: Page; member: Page; documentId: string }): Promise<void> {
  const links = await readShareLinks({ page: owner, documentId });
  const token = new URL(links[ShareLinkRole.Edit]).pathname.split('/').pop()!;
  const response = await member.request.post(shareLinkAcceptPath(token), { headers: sameOriginHeaders(member) });
  expect(response.ok()).toBe(true);
}

async function readOpenAnswer(response: APIResponse): Promise<OpenedDocument> {
  expect(response.status()).toBe(HttpStatus.Ok);
  return (await response.json()) as OpenedDocument;
}

async function openAnswer({ page, documentId }: { page: Page; documentId: string }): Promise<OpenAnswer> {
  const response = await page.request.get(documentApiPath({ documentId }));
  if (!response.ok()) return { status: response.status(), roomMode: null, stage: null };
  const { roomMode, bootstrap } = (await response.json()) as OpenedDocument;
  return { status: response.status(), roomMode, stage: bootstrap.stage };
}

async function waitUntilReady({ page, documentId, timeout }: { page: Page; documentId: string; timeout: number }): Promise<OpenedDocument> {
  await expect
    .poll(async () => (await openAnswer({ page, documentId })).stage, { timeout, intervals: STAGE_POLL_INTERVALS_MS })
    .toBe(BootstrapStage.Ready);
  return readOpenAnswer(await page.request.get(documentApiPath({ documentId })));
}

function trackSentBytes(page: Page): { bytes: number[] } {
  const sent = { bytes: [] as number[] };
  page.on('websocket', (socket) =>
    socket.on('framesent', ({ payload }) => sent.bytes.push(typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length)),
  );
  return sent;
}

test('an uploaded document is answered Join with the bootstrap in progress to every editor, then ready', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const buffer = buildLargeDocx(LARGE_PARAGRAPH);
  const documentId = await uploadDocument({ page: ana.page, buffer });
  await shareWithEditor({ owner: ana.page, member: bruno.page, documentId });
  const answers = await Promise.all([ana, bruno].map(({ page }) => openAnswer({ page, documentId })));
  answers.forEach((answer) => expect([answer.status, answer.roomMode]).toEqual([HttpStatus.Ok, RoomMode.Join]));
  answers.forEach((answer) => expect(PROGRESS_STAGES).toContain(answer.stage));
  const progress = (await readOpenAnswer(await ana.page.request.get(documentApiPath({ documentId })))).bootstrap;
  expect(progress).toMatchObject({ done: 0, total: buffer.byteLength, stateBytes: null });
  const ready = await waitUntilReady({ page: bruno.page, documentId, timeout: LARGE_READY_TIMEOUT_MS });
  expect(ready.bootstrap).toMatchObject({ done: buffer.byteLength, total: buffer.byteLength });
  expect(ready.bootstrap.stateBytes).toBeGreaterThan(buffer.byteLength);
  expect((await openAnswer({ page: ana.page, documentId })).roomMode).toBe(RoomMode.Join);
});

test('a document the server cannot read is reported Failed, never left preparing', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadDocument({ page: ana.page, buffer: buildBrokenDocx() });
  await expect
    .poll(async () => (await openAnswer({ page: ana.page, documentId })).stage, {
      timeout: READY_TIMEOUT_MS,
      intervals: STAGE_POLL_INTERVALS_MS,
    })
    .toBe(BootstrapStage.Failed);
  expect(await openAnswer({ page: ana.page, documentId })).toEqual({
    status: HttpStatus.Ok,
    roomMode: RoomMode.Join,
    stage: BootstrapStage.Failed,
  });
});

test('two editors open an uploaded document once it is ready and see one paragraph, written by neither browser', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadDocument({ page: ana.page, buffer: await seedBuffer([SEED_PARAGRAPH]) });
  await shareWithEditor({ owner: ana.page, member: bruno.page, documentId });
  await waitUntilReady({ page: ana.page, documentId, timeout: READY_TIMEOUT_MS });
  const sentByAna = trackSentBytes(ana.page);
  await Promise.all([ana.page, bruno.page].map((page) => page.goto(documentPagePath(documentId))));
  await Promise.all(
    [ana.page, bruno.page].map((page) =>
      expect(editorText(page).filter({ hasText: SEED_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS }),
    ),
  );
  const texts = await Promise.all([ana.page, bruno.page].map((page) => readEditorText(page)));
  texts.forEach((text) => expect(occurrencesOf({ text, fragment: SEED_PARAGRAPH })).toBe(1));
  expect(sentByAna.bytes.reduce((sum, bytes) => sum + bytes, 0)).toBeLessThan(JOINER_SENT_BYTES_LIMIT);
});

test('a 10 MB DOCX is built by the server and the uploader joins a snapshot', async ({ browser }) => {
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const uploadedAt = Date.now();
  const documentId = await uploadDocument({ page: ana.page, buffer: buildLargeDocx(LARGE_PARAGRAPH) });
  await waitUntilReady({ page: ana.page, documentId, timeout: LARGE_READY_TIMEOUT_MS });
  const readyAfterMs = Date.now() - uploadedAt;
  const sent = trackSentBytes(ana.page);
  const openedAt = Date.now();
  await ana.page.goto(documentPagePath(documentId));
  await expect(editorText(ana.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_READY_TIMEOUT_MS });
  const paragraphAfterMs = Date.now() - openedAt;
  test.info().annotations.push({
    type: 'large-open',
    description: `ready ${readyAfterMs} ms after the upload, first paragraph ${paragraphAfterMs} ms after the page opened`,
  });
  console.log(`large-open: ready ${readyAfterMs} ms after the upload, first paragraph ${paragraphAfterMs} ms after the page opened`);
  expect(Math.max(0, ...sent.bytes)).toBeLessThan(MAX_SOCKET_MESSAGE_BYTES);
  expect(sent.bytes.reduce((sum, bytes) => sum + bytes, 0)).toBeLessThan(JOINER_SENT_BYTES_LIMIT);
  await ana.page.reload();
  await expect(ana.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
  await expect(editorText(ana.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_READY_TIMEOUT_MS });
});
