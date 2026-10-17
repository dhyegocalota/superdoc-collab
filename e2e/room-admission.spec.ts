import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { APIResponse, Page, Response } from '@playwright/test';
import {
  ApiPath,
  COLLABORATION_TOKEN_PLACEHOLDER,
  DEMO_USERS,
  DOCX_MIME_TYPE,
  HttpMethod,
  HttpStatus,
  MAX_SOCKET_MESSAGE_BYTES,
  MINUTE_MS,
  RoomMode,
  SECOND_MS,
  SUPERDOC_ROOM_PREFIX,
  SUPERSEDED_ATTEMPT_CLOSE_CODE,
  ShareLinkRole,
  UPLOAD_FIELD,
  documentApiPath,
  documentPagePath,
  shareLinkAcceptPath,
  type DocumentSummary,
  type OpenedDocument,
} from '../libs/types/src';
import { UpdateLog, buildSeedDocx, findBootstrapSequence } from '../libs/history/src';
import { EDITOR_READY_TIMEOUT_MS, editorText, readEditorText, readShareLinks } from './editor';
import { buildLargeDocx } from './fixtures/large-docx';
import { expect, signedInContext, test } from './fixtures';

const EDITOR_TEST_ID = 'document-editor';
const CONNECTION_BANNER_TEST_ID = 'connection-banner';
const CONNECTION_STATE_ATTRIBUTE = 'data-state';
const SOCKETS_PER_UNINTERRUPTED_CREATE = 2;
const RECONNECTING_STATE = 'reconnecting';
const WAITING_VIEWPORTS = [
  { name: '375 px', viewport: { width: 375, height: 812 } },
  { name: '1280 px', viewport: { width: 1280, height: 800 } },
];
const ORIGIN_HEADER = 'origin';
const SEED_PARAGRAPH = 'Paragraph written by the creator.';
const LARGE_PARAGRAPH = 'Large document paragraph.';
const COMMIT_TIMEOUT_MS = 60_000;
const LARGE_COMMIT_TIMEOUT_MS = 120_000;
const LARGE_TEST_TIMEOUT_MS = 240_000;
const RESERVATION_EXPIRY_WAIT_MS = MINUTE_MS + SECOND_MS;
const SLOW_TEST_TIMEOUT_MS = RESERVATION_EXPIRY_WAIT_MS + 120_000;
const MINIMUM_FLUSHED_FRAMES = 3;
const SLOW_ENVIRONMENT_VARIABLE = 'E2E_SLOW';
const HISTORY_DATABASE_FILE = 'history.sqlite';
const CREATOR_SOCKET_STATE_KEY = 'creatorSocketState';
const AUTH_MESSAGE_TYPE = 2;
const TOKEN_AUTH_SUBTYPE = 0;
const AUTHENTICATED_AUTH_SUBTYPE = 2;

type OpenAnswer = { status: number; roomMode: RoomMode | null };
type CreatorSocketState = { isAuthenticated: boolean; closeCode: number | null };

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

async function describeOpenAnswer(response: APIResponse | Response): Promise<OpenAnswer> {
  if (!response.ok()) return { status: response.status(), roomMode: null };
  const { roomMode } = (await response.json()) as OpenedDocument;
  return { status: response.status(), roomMode };
}

async function openDocument({ page, documentId }: { page: Page; documentId: string }): Promise<OpenAnswer> {
  return describeOpenAnswer(await page.request.get(documentApiPath({ documentId })));
}

function isOpenResponse(documentId: string): (response: Response) => boolean {
  const openPath = documentApiPath({ documentId });
  return (response) => response.request().method() === HttpMethod.Get && new URL(response.url()).pathname === openPath;
}

function copyUncommittedUpdates({ sourceDocumentId, targetDocumentId }: { sourceDocumentId: string; targetDocumentId: string }): void {
  const history = new Database(join(process.env.E2E_DATABASE_DIR!, HISTORY_DATABASE_FILE));
  const updateLog = new UpdateLog(history);
  const sourceUpdates = updateLog.read({ documentName: sourceDocumentId, untilSequence: Number.MAX_SAFE_INTEGER });
  const commitSequence = findBootstrapSequence({ updates: sourceUpdates });
  if (commitSequence === null) throw new Error('The source document never committed');
  const abandoned = sourceUpdates.filter(({ sequence }) => sequence < commitSequence);
  if (!abandoned.some(({ update }) => Buffer.from(update).includes(SEED_PARAGRAPH)))
    throw new Error('The abandoned updates hold no seed text');
  abandoned.forEach(({ connectionUserId, connectionActor, update }) =>
    updateLog.append({ documentName: targetDocumentId, connectionUserId, connectionActor, update }),
  );
  history.close();
}

async function holdCreatorSocket({ page, documentId }: { page: Page; documentId: string }): Promise<void> {
  await page.evaluate(
    ({ roomName, token, stateKey, socketPath, messageTypes }) => {
      const encoder = new TextEncoder();
      const encodeVarUint = (value: number): number[] => (value < 128 ? [value] : [128 | (value & 127), ...encodeVarUint(value >>> 7)]);
      const encodeVarString = (text: string): number[] => {
        const bytes = Array.from(encoder.encode(text));
        return [...encodeVarUint(bytes.length), ...bytes];
      };
      const readVarUint = ({ bytes, offset }: { bytes: Uint8Array; offset: number }): { value: number; next: number } => {
        const byte = bytes[offset]!;
        if (byte < 128) return { value: byte, next: offset + 1 };
        const rest = readVarUint({ bytes, offset: offset + 1 });
        return { value: (byte & 127) | (rest.value << 7), next: rest.next };
      };
      const state: CreatorSocketState = { isAuthenticated: false, closeCode: null };
      Object.assign(window, { [stateKey]: state });
      const socket = new WebSocket(`${location.origin.replace('http', 'ws')}${socketPath}`);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () =>
        socket.send(
          new Uint8Array([
            ...encodeVarString(roomName),
            ...encodeVarUint(messageTypes.auth),
            ...encodeVarUint(messageTypes.token),
            ...encodeVarString(token),
          ]),
        );
      socket.onmessage = (event) => {
        const bytes = new Uint8Array(event.data as ArrayBuffer);
        const nameLength = readVarUint({ bytes, offset: 0 });
        const type = readVarUint({ bytes, offset: nameLength.next + nameLength.value });
        const subtype = readVarUint({ bytes, offset: type.next });
        if (type.value === messageTypes.auth && subtype.value === messageTypes.authenticated) state.isAuthenticated = true;
      };
      socket.onclose = (event) => {
        state.closeCode = event.code;
      };
    },
    {
      roomName: `${SUPERDOC_ROOM_PREFIX}${documentId}`,
      token: COLLABORATION_TOKEN_PLACEHOLDER,
      stateKey: CREATOR_SOCKET_STATE_KEY,
      socketPath: ApiPath.Collaboration,
      messageTypes: { auth: AUTH_MESSAGE_TYPE, token: TOKEN_AUTH_SUBTYPE, authenticated: AUTHENTICATED_AUTH_SUBTYPE },
    },
  );
}

async function readCreatorSocketState(page: Page): Promise<CreatorSocketState> {
  return page.evaluate((stateKey) => (window as unknown as Record<string, CreatorSocketState>)[stateKey]!, CREATOR_SOCKET_STATE_KEY);
}

test('two editors open a fresh document at once and only the first is answered Create', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadDocument({ page: ana.page, buffer: await seedBuffer([SEED_PARAGRAPH]) });
  await shareWithEditor({ owner: ana.page, member: bruno.page, documentId });
  const firstAnswers = await Promise.all(
    [ana, bruno].map(async ({ page }) => {
      const firstOpen = page.waitForResponse(isOpenResponse(documentId));
      await page.goto(documentPagePath(documentId));
      return describeOpenAnswer(await firstOpen);
    }),
  );
  expect(firstAnswers.filter((answer) => answer.roomMode === RoomMode.Create)).toHaveLength(1);
  expect(firstAnswers.filter((answer) => answer.status === HttpStatus.Conflict)).toHaveLength(1);
});

test('the holder opens a fresh document in two pages at once and the room holds one paragraph', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadDocument({ page: ana.page, buffer: await seedBuffer([SEED_PARAGRAPH]) });
  const secondPage = await ana.context.newPage();
  await Promise.all([ana.page, secondPage].map((page) => page.goto(documentPagePath(documentId))));
  await expect
    .poll(() => openDocument({ page: ana.page, documentId }), { timeout: COMMIT_TIMEOUT_MS })
    .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Join });
  await ana.page.reload();
  await expect(editorText(ana.page).filter({ hasText: SEED_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  expect(occurrencesOf({ text: await readEditorText(ana.page), fragment: SEED_PARAGRAPH })).toBe(1);
});

for (const { name, viewport } of WAITING_VIEWPORTS) {
  test(`the second editor's open is answered 200 Join once the creator commits at ${name}`, async ({ browser }) => {
    const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
    const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
    const documentId = await uploadDocument({ page: ana.page, buffer: await seedBuffer([SEED_PARAGRAPH]) });
    await shareWithEditor({ owner: ana.page, member: bruno.page, documentId });
    expect((await openDocument({ page: ana.page, documentId })).roomMode).toBe(RoomMode.Create);
    await bruno.page.setViewportSize(viewport);
    const firstOpen = bruno.page.waitForResponse(isOpenResponse(documentId));
    await bruno.page.goto(documentPagePath(documentId));
    expect((await firstOpen).status()).toBe(HttpStatus.Conflict);
    await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).toHaveCount(0);
    await expect.poll(() => bruno.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await ana.page.goto(documentPagePath(documentId));
    await expect(ana.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
    await expect
      .poll(() => openDocument({ page: bruno.page, documentId }), { timeout: COMMIT_TIMEOUT_MS })
      .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Join });
    await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).toBeVisible({ timeout: COMMIT_TIMEOUT_MS });
    await expect.poll(() => bruno.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test('a creator who closes its tab mid-create leaves no duplicated paragraph for the next editor', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const buffer = await seedBuffer([SEED_PARAGRAPH]);
  const abandonedDocumentId = await uploadDocument({ page: ana.page, buffer });
  await ana.page.goto(documentPagePath(abandonedDocumentId));
  await expect
    .poll(() => openDocument({ page: ana.page, documentId: abandonedDocumentId }), { timeout: COMMIT_TIMEOUT_MS })
    .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Join });
  const documentId = await uploadDocument({ page: ana.page, buffer });
  copyUncommittedUpdates({ sourceDocumentId: abandonedDocumentId, targetDocumentId: documentId });
  await shareWithEditor({ owner: ana.page, member: bruno.page, documentId });
  await bruno.page.goto(documentPagePath(documentId));
  await expect(editorText(bruno.page).filter({ hasText: SEED_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await expect
    .poll(() => openDocument({ page: bruno.page, documentId }), { timeout: COMMIT_TIMEOUT_MS })
    .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Join });
  expect((await readEditorText(bruno.page)).split(SEED_PARAGRAPH)).toHaveLength(2);
});

test('a 10 MB DOCX commits and reopens as Join', async ({ browser }) => {
  test.setTimeout(LARGE_TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadDocument({ page: ana.page, buffer: buildLargeDocx(LARGE_PARAGRAPH) });
  const sentFrameBytes: number[] = [];
  let socketCount = 0;
  ana.page.on('websocket', (socket) => {
    socketCount++;
    socket.on('framesent', ({ payload }) => sentFrameBytes.push(typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length));
  });
  const banner = ana.page.getByTestId(CONNECTION_BANNER_TEST_ID);
  await ana.page.goto(documentPagePath(documentId));
  await expect(editorText(ana.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_COMMIT_TIMEOUT_MS });
  await expect
    .poll(() => openDocument({ page: ana.page, documentId }), { timeout: LARGE_COMMIT_TIMEOUT_MS })
    .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Join });
  expect(sentFrameBytes.length).toBeGreaterThan(0);
  expect(socketCount).toBe(SOCKETS_PER_UNINTERRUPTED_CREATE);
  expect(Math.max(...sentFrameBytes)).toBeLessThan(MAX_SOCKET_MESSAGE_BYTES);
  await expect
    .poll(async () => ((await banner.count()) === 0 ? null : banner.getAttribute(CONNECTION_STATE_ATTRIBUTE)), {
      timeout: COMMIT_TIMEOUT_MS,
    })
    .not.toBe(RECONNECTING_STATE);
  await ana.page.reload();
  await expect(ana.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
  await expect(editorText(ana.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_COMMIT_TIMEOUT_MS });
});

test("a superseded creator's socket closes with 4403 after the 60 s expiry", async ({ browser }) => {
  test.skip(!process.env[SLOW_ENVIRONMENT_VARIABLE], `Waits for the 60 s reservation expiry; set ${SLOW_ENVIRONMENT_VARIABLE}=1 to run it`);
  test.setTimeout(SLOW_TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadDocument({ page: ana.page, buffer: await seedBuffer([SEED_PARAGRAPH]) });
  await shareWithEditor({ owner: ana.page, member: bruno.page, documentId });
  expect((await openDocument({ page: ana.page, documentId })).roomMode).toBe(RoomMode.Create);
  await holdCreatorSocket({ page: ana.page, documentId });
  await expect.poll(() => readCreatorSocketState(ana.page)).toMatchObject({ isAuthenticated: true });
  await expect
    .poll(() => openDocument({ page: bruno.page, documentId }), {
      timeout: RESERVATION_EXPIRY_WAIT_MS + COMMIT_TIMEOUT_MS,
      intervals: [SECOND_MS],
    })
    .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Create });
  await expect
    .poll(() => readCreatorSocketState(ana.page), { timeout: COMMIT_TIMEOUT_MS })
    .toMatchObject({ closeCode: SUPERSEDED_ATTEMPT_CLOSE_CODE });
});

test('a creator who goes offline mid-create is replaced by the next editor and leaves one paragraph set', async ({ browser }) => {
  test.skip(
    !process.env[SLOW_ENVIRONMENT_VARIABLE],
    `Can wait for the 60 s reservation expiry; set ${SLOW_ENVIRONMENT_VARIABLE}=1 to run it`,
  );
  test.setTimeout(SLOW_TEST_TIMEOUT_MS);
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadDocument({ page: ana.page, buffer: await seedBuffer([SEED_PARAGRAPH]) });
  await shareWithEditor({ owner: ana.page, member: bruno.page, documentId });
  const anaSocketFrames: number[] = [];
  ana.page.on('websocket', (socket) => {
    anaSocketFrames.push(0);
    const socketIndex = anaSocketFrames.length - 1;
    socket.once('framesent', () => void ana.context.setOffline(true));
    socket.on('framesent', () => anaSocketFrames[socketIndex]!++);
  });
  await ana.page.goto(documentPagePath(documentId));
  await expect.poll(() => anaSocketFrames.length).toBeGreaterThan(0);
  await expect
    .poll(() => openDocument({ page: bruno.page, documentId }), {
      timeout: RESERVATION_EXPIRY_WAIT_MS + COMMIT_TIMEOUT_MS,
      intervals: [SECOND_MS],
    })
    .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Create });
  await bruno.page.goto(documentPagePath(documentId));
  await expect(editorText(bruno.page).filter({ hasText: SEED_PARAGRAPH }).first()).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await expect
    .poll(() => openDocument({ page: bruno.page, documentId }), { timeout: COMMIT_TIMEOUT_MS })
    .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Join });
  await ana.context.setOffline(false);
  await expect.poll(() => anaSocketFrames.at(-1)!, { timeout: COMMIT_TIMEOUT_MS }).toBeGreaterThan(MINIMUM_FLUSHED_FRAMES);
  await expect
    .poll(
      async () => {
        const [anaText, brunoText] = await Promise.all([readEditorText(ana.page), readEditorText(bruno.page)]);
        if (anaText !== brunoText) return null;
        return occurrencesOf({ text: brunoText, fragment: SEED_PARAGRAPH });
      },
      { timeout: COMMIT_TIMEOUT_MS },
    )
    .toBe(1);
  await bruno.page.reload();
  await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
});
