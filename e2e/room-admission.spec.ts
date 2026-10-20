import type { APIResponse, Browser, Page } from '@playwright/test';
import {
  ApiPath,
  AppRoute,
  BOOTSTRAP_LIGHT_MAX_BYTES,
  BOOTSTRAP_STATE_BYTES_RATIO,
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
import { EDITOR_READY_TIMEOUT_MS, editorText, readEditorText, readShareLinks, sameOriginHeaders, uploadDocument } from './editor';
import { buildBrokenDocx, buildDeflatedLargeDocx, buildLargeDocx } from './fixtures/large-docx';
import {
  type OpenedContext,
  acceptInvite,
  expect,
  expectSignedInAs,
  generateInvite,
  signedInAdmin,
  signedInContext,
  test,
  uniqueEmail,
} from './fixtures';

const EDITOR_TEST_ID = 'document-editor';
const SEED_PARAGRAPH = 'Paragraph written by the server.';
const LARGE_PARAGRAPH = 'Large document paragraph.';
const READY_TIMEOUT_MS = 60_000;
const BLANK_READY_LIMIT_MS = 5_000;
const BLANK_INSTANT_LIMIT_MS = 200;
const LARGE_READY_TIMEOUT_MS = 180_000;
const LARGE_TEST_TIMEOUT_MS = 360_000;
const STAGE_POLL_INTERVALS_MS = [250];
const BYTES_PER_MEGABYTE = 1024 * 1024;
const JOINER_SENT_BYTES_LIMIT = BYTES_PER_MEGABYTE;
const ZIP_OVERHEAD_BYTES = 4096;
const PROGRESS_STAGES = [BootstrapStage.Queued, BootstrapStage.Preparing];

type OpenAnswer = { status: number; roomMode: RoomMode | null; stage: BootstrapStage | null };

function occurrencesOf({ text, fragment }: { text: string; fragment: string }): number {
  return text.split(fragment).length - 1;
}

async function seedBuffer(paragraphs: string[]): Promise<Buffer> {
  return buildSeedDocx(paragraphs.map((text) => ({ text, trackedChanges: [] })));
}

async function shareWithEditor({ owner, member, documentId }: { owner: Page; member: Page; documentId: string }): Promise<void> {
  const links = await readShareLinks({ page: owner, documentId });
  const token = new URL(links[ShareLinkRole.Edit]).pathname.split('/').pop()!;
  const response = await member.request.post(shareLinkAcceptPath(token), { headers: sameOriginHeaders(member) });
  expect(response.ok()).toBe(true);
}

async function invitedPerson({ browser, name }: { browser: Browser; name: string }): Promise<OpenedContext> {
  const admin = await signedInAdmin({ browser });
  await admin.page.goto(AppRoute.Admin);
  const person = await acceptInvite({
    browser,
    url: await generateInvite({ page: admin.page }),
    name,
    email: uniqueEmail(name.toLowerCase()),
  });
  await expectSignedInAs({ page: person.page, name });
  return person;
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
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const dani = await signedInContext({ browser, user: DEMO_USERS[3]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const buffer = buildLargeDocx(LARGE_PARAGRAPH);
  const documentId = await uploadDocument({ page: dani.page, buffer });
  await shareWithEditor({ owner: dani.page, member: bruno.page, documentId });
  const answers = await Promise.all([dani, bruno].map(({ page }) => openAnswer({ page, documentId })));
  answers.forEach((answer) => expect([answer.status, answer.roomMode]).toEqual([HttpStatus.Ok, RoomMode.Join]));
  answers.forEach((answer) => expect(PROGRESS_STAGES).toContain(answer.stage));
  const progress = (await readOpenAnswer(await dani.page.request.get(documentApiPath({ documentId })))).bootstrap;
  expect(progress.documentXmlBytes).toBeGreaterThan(buffer.byteLength - ZIP_OVERHEAD_BYTES);
  expect(progress).toMatchObject({ total: progress.documentXmlBytes * BOOTSTRAP_STATE_BYTES_RATIO, stateBytes: null });
  expect(progress.done).toBeLessThan(progress.total);
  const ready = await waitUntilReady({ page: bruno.page, documentId, timeout: LARGE_READY_TIMEOUT_MS });
  expect(ready.bootstrap.done).toBe(ready.bootstrap.total);
  expect(ready.bootstrap.stateBytes).toBeGreaterThan(buffer.byteLength);
  expect((await openAnswer({ page: dani.page, documentId })).roomMode).toBe(RoomMode.Join);
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

test('a document the server cannot read does not hold back the next blank document', async ({ browser }) => {
  const lena = await invitedPerson({ browser, name: 'Lena' });
  await uploadDocument({ page: lena.page, buffer: buildBrokenDocx() });
  const startedAt = Date.now();
  const created = await lena.page.request.post(ApiPath.Documents, { data: { title: `blank-${startedAt}` } });
  expect(created.status()).toBe(HttpStatus.Created);
  const { id: blankId } = (await created.json()) as DocumentSummary;
  await expect
    .poll(async () => (await openAnswer({ page: lena.page, documentId: blankId })).stage, {
      timeout: BLANK_READY_LIMIT_MS,
      intervals: STAGE_POLL_INTERVALS_MS,
    })
    .toBe(BootstrapStage.Ready);
  console.log(`blank-after-broken: ready ${Date.now() - startedAt} ms after the create`);
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
  const caio = await signedInContext({ browser, user: DEMO_USERS[2]! });
  const uploadedAt = Date.now();
  const documentId = await uploadDocument({ page: caio.page, buffer: buildLargeDocx(LARGE_PARAGRAPH) });
  await waitUntilReady({ page: caio.page, documentId, timeout: LARGE_READY_TIMEOUT_MS });
  const readyAfterMs = Date.now() - uploadedAt;
  const sent = trackSentBytes(caio.page);
  const openedAt = Date.now();
  await caio.page.goto(documentPagePath(documentId));
  await expect(editorText(caio.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_READY_TIMEOUT_MS });
  const paragraphAfterMs = Date.now() - openedAt;
  test.info().annotations.push({
    type: 'large-open',
    description: `ready ${readyAfterMs} ms after the upload, first paragraph ${paragraphAfterMs} ms after the page opened`,
  });
  console.log(`large-open: ready ${readyAfterMs} ms after the upload, first paragraph ${paragraphAfterMs} ms after the page opened`);
  expect(Math.max(0, ...sent.bytes)).toBeLessThan(MAX_SOCKET_MESSAGE_BYTES);
  expect(sent.bytes.reduce((sum, bytes) => sum + bytes, 0)).toBeLessThan(JOINER_SENT_BYTES_LIMIT);
  await caio.page.reload();
  await expect(caio.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
  await expect(editorText(caio.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_READY_TIMEOUT_MS });
});

test('a deflated heavy DOCX is prepared by the size of its XML: the heavy lane, the long timeout, then ready', async ({ browser }) => {
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const mira = await invitedPerson({ browser, name: 'Mira' });
  const buffer = buildDeflatedLargeDocx(LARGE_PARAGRAPH);
  expect(buffer.byteLength).toBeLessThan(BYTES_PER_MEGABYTE);
  const documentId = await uploadDocument({ page: mira.page, buffer });
  const progress = (await readOpenAnswer(await mira.page.request.get(documentApiPath({ documentId })))).bootstrap;
  expect(progress.documentXmlBytes).toBeGreaterThan(BOOTSTRAP_LIGHT_MAX_BYTES);
  expect(progress.total).toBe(progress.documentXmlBytes * BOOTSTRAP_STATE_BYTES_RATIO);
  const ready = await waitUntilReady({ page: mira.page, documentId, timeout: LARGE_READY_TIMEOUT_MS });
  expect(ready.bootstrap.stage).toBe(BootstrapStage.Ready);
});

test('a blank document is ready in the answer of its create, from the state the first blank left, with no lane', async ({ browser }) => {
  const nico = await invitedPerson({ browser, name: 'Nico' });
  const first = await nico.page.request.post(ApiPath.Documents, { data: { title: `warm-${Date.now()}` } });
  const { id: firstId } = (await first.json()) as DocumentSummary;
  await waitUntilReady({ page: nico.page, documentId: firstId, timeout: BLANK_READY_LIMIT_MS });
  const startedAt = Date.now();
  const created = await nico.page.request.post(ApiPath.Documents, { data: { title: `instant-${startedAt}` } });
  const { id: blankId } = (await created.json()) as DocumentSummary;
  const answer = await openAnswer({ page: nico.page, documentId: blankId });
  expect(answer.stage).toBe(BootstrapStage.Ready);
  expect(Date.now() - startedAt).toBeLessThan(BLANK_INSTANT_LIMIT_MS);
});
