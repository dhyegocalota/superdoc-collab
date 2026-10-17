import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import type { APIResponse, Page, Response } from '@playwright/test';
import {
  ApiPath,
  COLLABORATION_TOKEN_PLACEHOLDER,
  DEMO_USERS,
  DOCX_MIME_TYPE,
  HttpMethod,
  HttpStatus,
  MINUTE_MS,
  RoomMode,
  SECOND_MS,
  ShareLinkRole,
  UPLOAD_FIELD,
  documentApiPath,
  documentPagePath,
  shareLinkAcceptPath,
  type DocumentSummary,
  type OpenedDocument,
} from '../libs/types/src';
import { buildSeedDocx, findBootstrapSequence } from '../libs/history/src';
import type { LoggedUpdate } from '../libs/history/src/update-log';
import { SUPERDOC_ROOM_PREFIX } from '../apps/server/src/collaboration/room-name';
import { EDITOR_READY_TIMEOUT_MS, editorText, readEditorText, readShareLinks } from './editor';
import { expect, signedInContext, test } from './fixtures';

const EDITOR_TEST_ID = 'document-editor';
const ORIGIN_HEADER = 'origin';
const SEED_PARAGRAPH = 'Paragraph written by the creator.';
const LARGE_PARAGRAPH = 'Large document paragraph.';
const COMMIT_TIMEOUT_MS = 60_000;
const LARGE_COMMIT_TIMEOUT_MS = 120_000;
const LARGE_TEST_TIMEOUT_MS = 240_000;
const SUPERSEDED_ATTEMPT_CLOSE_CODE = 4403;
const RESERVATION_EXPIRY_WAIT_MS = MINUTE_MS + SECOND_MS;
const SLOW_TEST_TIMEOUT_MS = RESERVATION_EXPIRY_WAIT_MS + 120_000;
const SLOW_ENVIRONMENT_VARIABLE = 'E2E_SLOW';
const HISTORY_DATABASE_FILE = 'history.sqlite';
const CREATOR_SOCKET_STATE_KEY = 'creatorSocketState';
const AUTH_MESSAGE_TYPE = 2;
const TOKEN_AUTH_SUBTYPE = 0;
const AUTHENTICATED_AUTH_SUBTYPE = 2;

const IMAGE_WIDTH_PIXELS = 1000;
const IMAGE_HEIGHT_PIXELS = 3328;
const BYTES_PER_PIXEL = 3;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BIT_DEPTH = 8;
const PNG_RGB_COLOR_TYPE = 2;
const STORED_COMPRESSION_LEVEL = 0;
const PSEUDO_RANDOM_SEED = 2463534242;
const XORSHIFT_LEFT_FIRST = 13;
const XORSHIFT_RIGHT = 17;
const XORSHIFT_LEFT_SECOND = 5;
const BYTE_MASK = 0xff;
const ZIP_VERSION = 20;
const ZIP_DOS_DATE = 33;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const EMU_PER_PIXEL = 9525;
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const PACKAGE_RELATIONSHIPS_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WORD_DRAWING_NAMESPACE = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const DRAWING_NAMESPACE = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PICTURE_NAMESPACE = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

type ZipEntry = { name: string; data: Buffer };
type OpenAnswer = { status: number; roomMode: RoomMode | null };
type CreatorSocketState = { isAuthenticated: boolean; closeCode: number | null };

function uniqueFileName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}.docx`;
}

function pseudoRandomBytes(length: number): Buffer {
  const bytes = Buffer.alloc(length);
  let state = PSEUDO_RANDOM_SEED;
  for (let index = 0; index < length; index++) {
    state ^= state << XORSHIFT_LEFT_FIRST;
    state ^= state >>> XORSHIFT_RIGHT;
    state ^= state << XORSHIFT_LEFT_SECOND;
    bytes[index] = state & BYTE_MASK;
  }
  return bytes;
}

function pngChunk({ type, data }: { type: string; data: Buffer }): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function noisePng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(IMAGE_WIDTH_PIXELS, 0);
  header.writeUInt32BE(IMAGE_HEIGHT_PIXELS, 4);
  header[8] = PNG_BIT_DEPTH;
  header[9] = PNG_RGB_COLOR_TYPE;
  const rowBytes = 1 + IMAGE_WIDTH_PIXELS * BYTES_PER_PIXEL;
  const rows = pseudoRandomBytes(rowBytes * IMAGE_HEIGHT_PIXELS);
  Array.from({ length: IMAGE_HEIGHT_PIXELS }, (_, row) => row * rowBytes).forEach((offset) => (rows[offset] = 0));
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk({ type: 'IHDR', data: header }),
    pngChunk({ type: 'IDAT', data: deflateSync(rows, { level: STORED_COMPRESSION_LEVEL }) }),
    pngChunk({ type: 'IEND', data: Buffer.alloc(0) }),
  ]);
}

function storedZip(entries: ZipEntry[]): Buffer {
  const localParts = entries.map(({ name, data }) => {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(ZIP_LOCAL_SIGNATURE, 0);
    header.writeUInt16LE(ZIP_VERSION, 4);
    header.writeUInt16LE(ZIP_DOS_DATE, 12);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(Buffer.byteLength(name), 26);
    return Buffer.concat([header, Buffer.from(name), data]);
  });
  const offsets = localParts.map((_, index) => localParts.slice(0, index).reduce((sum, part) => sum + part.length, 0));
  const centralParts = entries.map(({ name, data }, index) => {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0);
    header.writeUInt16LE(ZIP_VERSION, 4);
    header.writeUInt16LE(ZIP_VERSION, 6);
    header.writeUInt16LE(ZIP_DOS_DATE, 14);
    header.writeUInt32LE(crc32(data), 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(Buffer.byteLength(name), 28);
    header.writeUInt32LE(offsets[index]!, 42);
    return Buffer.concat([header, Buffer.from(name)]);
  });
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(ZIP_END_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(
    localParts.reduce((sum, part) => sum + part.length, 0),
    16,
  );
  return Buffer.concat([...localParts, central, end]);
}

function inlineImage(): string {
  const width = IMAGE_WIDTH_PIXELS * EMU_PER_PIXEL;
  const height = IMAGE_HEIGHT_PIXELS * EMU_PER_PIXEL;
  return (
    `<w:r><w:drawing><wp:inline><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="1" name="Picture 1"/>` +
    `<a:graphic><a:graphicData uri="${PICTURE_NAMESPACE}"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    '<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

function buildLargeDocx(paragraphText: string): Buffer {
  const documentXml =
    `${XML_HEADER}<w:document xmlns:w="${WORD_NAMESPACE}" xmlns:r="${RELATIONSHIP_NAMESPACE}" xmlns:wp="${WORD_DRAWING_NAMESPACE}" ` +
    `xmlns:a="${DRAWING_NAMESPACE}" xmlns:pic="${PICTURE_NAMESPACE}"><w:body>` +
    `<w:p><w:r><w:t>${paragraphText}</w:t></w:r></w:p><w:p>${inlineImage()}</w:p><w:sectPr/></w:body></w:document>`;
  return storedZip([
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NAMESPACE}">` +
          `<Relationship Id="rId1" Type="${RELATIONSHIP_NAMESPACE}/officeDocument" Target="word/document.xml"/></Relationships>`,
      ),
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: Buffer.from(
        `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NAMESPACE}">` +
          `<Relationship Id="rId1" Type="${RELATIONSHIP_NAMESPACE}/image" Target="media/image1.png"/></Relationships>`,
      ),
    },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
    { name: 'word/media/image1.png', data: noisePng() },
  ]);
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
  const sourceUpdates = history
    .prepare('SELECT sequence, update_bytes FROM updates WHERE document_name = ? ORDER BY sequence')
    .all(sourceDocumentId) as { sequence: number; update_bytes: Buffer }[];
  const commitSequence = findBootstrapSequence({
    updates: sourceUpdates.map(({ sequence, update_bytes }) => ({ sequence, update: new Uint8Array(update_bytes) }) as LoggedUpdate),
  });
  if (commitSequence === null) throw new Error('The source document never committed');
  const abandoned = sourceUpdates.filter(({ sequence }) => sequence < commitSequence);
  if (!abandoned.some(({ update_bytes }) => update_bytes.includes(SEED_PARAGRAPH)))
    throw new Error('The abandoned updates hold no seed text');
  history
    .prepare(
      `INSERT INTO updates (document_name, connection_user_id, connection_actor, yjs_client_ids, server_time, update_bytes)
       SELECT ?, connection_user_id, connection_actor, yjs_client_ids, server_time, update_bytes
       FROM updates WHERE document_name = ? AND sequence < ? ORDER BY sequence`,
    )
    .run(targetDocumentId, sourceDocumentId, commitSequence);
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
  const answers = await Promise.all([ana, bruno].map(({ page }) => openDocument({ page, documentId })));
  expect(answers.filter((answer) => answer.roomMode === RoomMode.Create)).toHaveLength(1);
  expect(answers.filter((answer) => answer.status === HttpStatus.Conflict)).toHaveLength(1);
});

test("the second editor's open is answered 200 Join once the creator commits", async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadDocument({ page: ana.page, buffer: await seedBuffer([SEED_PARAGRAPH]) });
  await shareWithEditor({ owner: ana.page, member: bruno.page, documentId });
  expect((await openDocument({ page: ana.page, documentId })).roomMode).toBe(RoomMode.Create);
  const firstOpen = bruno.page.waitForResponse(isOpenResponse(documentId));
  await bruno.page.goto(documentPagePath(documentId));
  expect((await firstOpen).status()).toBe(HttpStatus.Conflict);
  await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).toHaveCount(0);
  await ana.page.goto(documentPagePath(documentId));
  await expect(ana.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
  await expect
    .poll(() => openDocument({ page: bruno.page, documentId }), { timeout: COMMIT_TIMEOUT_MS })
    .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Join });
  await bruno.page.reload();
  await expect(bruno.page.getByTestId(EDITOR_TEST_ID)).toBeVisible();
});

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
  await ana.page.goto(documentPagePath(documentId));
  await expect(editorText(ana.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: LARGE_COMMIT_TIMEOUT_MS });
  await expect
    .poll(() => openDocument({ page: ana.page, documentId }), { timeout: LARGE_COMMIT_TIMEOUT_MS })
    .toEqual({ status: HttpStatus.Ok, roomMode: RoomMode.Join });
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
