import {
  DOCX_MIME_TYPE,
  RoomMode,
  AgentActionKind,
  AgentTool,
  DocumentRole,
  documentPagePath,
  OPEN_RATE_LIMITED_MESSAGE,
  OPEN_UNCOMMITTED_PER_MINUTE,
  ShareLinkRole,
  type DocumentMembers,
} from '@superdoc-collab/types';
import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { memberWithRole, documentWithOwner } from '../testing/collaboration-client';
import type { TestServer, TestUser } from '../testing/test-server';
import { resultJson, sessionsOn, TOOL_APP_ORIGIN, toolContext } from './agent-tool-fixtures';
import { callAgentTool, TOOL_FAILED_MESSAGE } from './agent-tools';
import { MAX_EDITS, MAX_TEXT_LENGTH, MAX_TEXTS } from './document-tools';

const DOCX_BYTES = Buffer.from('PK-fake-docx');
const INSPECTED = { revision: 3, paragraphs: ['Budget'] };
const RECEIPT = { status: 'ok' };
const EDITS = [{ find: 'Budget', replace: 'Plan' }];

let server: TestServer;
let documentId: string;
let owner: TestUser;
let editor: TestUser;
let reader: TestUser;

beforeAll(async () => {
  ({ server, documentId, owner } = await documentWithOwner());
  editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
});

beforeEach(() => {
  vi.spyOn(server.services.runtime, 'roomModeFor').mockReturnValue({ isSpent: false, roomMode: RoomMode.Join });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await server.stop();
});

test('inspect_document dispatches superdoc_inspect on the session of the person', async () => {
  const dispatch = vi.fn().mockResolvedValue(INSPECTED);
  const document = { save: vi.fn() };
  const { context } = toolContext({ server, userId: editor.id, sessions: sessionsOn(document), dispatch });
  const result = await callAgentTool({ tool: AgentTool.InspectDocument, input: { documentId }, context });
  expect(dispatch).toHaveBeenCalledWith(document, 'superdoc_inspect', {});
  expect(resultJson(result)).toEqual(INSPECTED);
});

test.each([
  { name: 'a replacement', input: { action: 'replace_text', edits: EDITS }, args: { action: 'replace_text', edits: EDITS } },
  {
    name: 'paragraphs',
    input: { action: 'insert_paragraphs', texts: ['One', 'Two'] },
    args: { action: 'insert_paragraphs', texts: ['One', 'Two'] },
  },
  {
    name: 'a heading',
    input: { action: 'insert_heading', text: 'Plan', level: 2 },
    args: { action: 'insert_heading', text: 'Plan', level: 2 },
  },
  {
    name: 'a replacement asked as direct',
    input: { action: 'replace_text', edits: EDITS, changeMode: 'direct' },
    args: { action: 'replace_text', edits: EDITS },
  },
])('edit_document applies $name as a tracked change', async ({ input, args }) => {
  const dispatch = vi.fn().mockResolvedValue(RECEIPT);
  const document = { save: vi.fn() };
  const { context } = toolContext({ server, userId: editor.id, sessions: sessionsOn(document), dispatch });
  const result = await callAgentTool({ tool: AgentTool.EditDocument, input: { documentId, ...input }, context });
  expect(dispatch).toHaveBeenCalledWith(document, 'superdoc_perform_action', { ...args, changeMode: 'tracked' });
  expect(resultJson(result)).toEqual(RECEIPT);
});

test.each(['accept_tracked_changes', 'reject_tracked_changes', 'trackChanges.decide', 'delete_document'])(
  'edit_document refuses the %s action and dispatches nothing',
  async (action) => {
    const dispatch = vi.fn();
    const { context } = toolContext({ server, userId: editor.id, sessions: sessionsOn({ save: vi.fn() }), dispatch });
    const result = await callAgentTool({ tool: AgentTool.EditDocument, input: { documentId, action }, context });
    expect(result.isError).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  },
);

test.each([
  { action: 'replace_text', missing: 'edits' },
  { action: 'insert_paragraphs', missing: 'texts' },
  { action: 'insert_heading', missing: 'text' },
])('edit_document $action without $missing is a tool error', async ({ action, missing }) => {
  const dispatch = vi.fn();
  const { context } = toolContext({ server, userId: editor.id, sessions: sessionsOn({ save: vi.fn() }), dispatch });
  const result = await callAgentTool({ tool: AgentTool.EditDocument, input: { documentId, action }, context });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(resultJson(result))).toContain(missing);
  expect(dispatch).not.toHaveBeenCalled();
});

test('export_docx returns the live document as an embedded DOCX resource, records the export and removes the temporary file', async () => {
  const written: string[] = [];
  const save = vi.fn(async ({ out }: { out: string }) => {
    written.push(out);
    await writeFile(out, DOCX_BYTES);
  });
  const { context, recorded } = toolContext({ server, userId: reader.id, sessions: sessionsOn({ save }) });
  const result = await callAgentTool({ tool: AgentTool.ExportDocx, input: { documentId }, context });
  expect(result.content).toEqual([
    {
      type: 'resource',
      resource: { uri: expect.stringContaining(documentId), mimeType: DOCX_MIME_TYPE, blob: DOCX_BYTES.toString('base64') },
    },
  ]);
  expect(recorded).toEqual([{ documentId, userId: reader.id, kind: AgentActionKind.DocumentExported }]);
  expect(existsSync(dirname(written[0]!))).toBe(false);
});

test('export_docx with the open budget spent is refused before any log scan', async () => {
  vi.restoreAllMocks();
  const spender = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  Array.from({ length: OPEN_UNCOMMITTED_PER_MINUTE }).forEach((_, index) =>
    server.services.openBudget.record({ userId: spender.id, documentId: `spent-${index}` }),
  );
  try {
    const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
    const save = vi.fn();
    const { context, recorded } = toolContext({ server, userId: spender.id, sessions: sessionsOn({ save }) });
    const result = await callAgentTool({ tool: AgentTool.ExportDocx, input: { documentId }, context });
    expect(resultJson(result)).toEqual({ error: OPEN_RATE_LIMITED_MESSAGE, retryAfterSeconds: expect.any(Number) });
    expect([result.isError, save.mock.calls.length, readBatch.mock.calls.length, recorded]).toEqual([true, 0, 0, []]);
  } finally {
    server.database.sqlite.prepare('DELETE FROM document_members WHERE user_id = ?').run(spender.id);
  }
});

test('export_docx hides the cause, logs it, removes the temporary file and records nothing when the save fails', async () => {
  const written: string[] = [];
  const save = vi.fn(async ({ out }: { out: string }) => {
    written.push(out);
    throw new Error('the room is gone');
  });
  const { context, recorded } = toolContext({ server, userId: reader.id, sessions: sessionsOn({ save }) });
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const result = await callAgentTool({ tool: AgentTool.ExportDocx, input: { documentId }, context });
  expect([result.isError, resultJson(result)]).toEqual([true, { error: TOOL_FAILED_MESSAGE }]);
  expect(logged).toHaveBeenCalledWith(expect.stringContaining('the room is gone'));
  expect(recorded).toEqual([]);
  expect(existsSync(dirname(written[0]!))).toBe(false);
});

test('list_members returns the members with their roles and presence', async () => {
  const { context } = toolContext({ server, userId: reader.id });
  const members = resultJson(await callAgentTool({ tool: AgentTool.ListMembers, input: { documentId }, context })) as DocumentMembers;
  expect(members.members.map(({ user, role }) => [user.id, role]).sort()).toEqual(
    [
      [owner.id, DocumentRole.Owner],
      [editor.id, DocumentRole.Editor],
      [reader.id, DocumentRole.Reader],
    ].sort(),
  );
  expect(members.members.every(({ online }) => online === false)).toBe(true);
});

const SHARE_PATH_FRAGMENT = '/share/';

test('get_share_links points the owner to the Share dialog without any link secret and records nothing, and an editor gets the role error', async () => {
  const asOwner = toolContext({ server, userId: owner.id });
  const result = await callAgentTool({ tool: AgentTool.GetShareLinks, input: { documentId }, context: asOwner.context });
  const text = JSON.stringify(resultJson(result));
  expect(resultJson(result)).toEqual({
    documentUrl: `${TOOL_APP_ORIGIN}${documentPagePath(documentId)}`,
    instruction: expect.stringContaining('Share'),
  });
  Object.values(server.services.shareLinks.links(documentId)).forEach((link) => expect(text).not.toContain(link));
  expect(text).not.toContain(SHARE_PATH_FRAGMENT);
  expect(asOwner.recorded).toEqual([]);
  const asEditor = toolContext({ server, userId: editor.id });
  const refused = await callAgentTool({ tool: AgentTool.GetShareLinks, input: { documentId }, context: asEditor.context });
  expect([refused.isError, asEditor.recorded]).toEqual([true, []]);
});

test.each(Object.values(ShareLinkRole))('rotate_share_link rotates only the %s link, records it and reveals no link', async (role) => {
  const before = server.services.shareLinks.links(documentId);
  const { context, recorded } = toolContext({ server, userId: owner.id });
  const result = await callAgentTool({ tool: AgentTool.RotateShareLink, input: { documentId, role }, context });
  const after = server.services.shareLinks.links(documentId);
  const untouched = Object.values(ShareLinkRole).filter((other) => other !== role);
  expect(after[role]).not.toBe(before[role]);
  untouched.forEach((other) => expect(after[other]).toBe(before[other]));
  expect(resultJson(result)).toEqual({
    rotated: role,
    documentUrl: `${TOOL_APP_ORIGIN}${documentPagePath(documentId)}`,
    instruction: expect.stringContaining('Share'),
  });
  expect(JSON.stringify(resultJson(result))).not.toContain(SHARE_PATH_FRAGMENT);
  expect(recorded).toEqual([{ documentId, userId: owner.id, kind: AgentActionKind.ShareLinkRotated }]);
});

test('rotate_share_link with an unknown role is a tool error and rotates nothing', async () => {
  const before = server.services.shareLinks.links(documentId);
  const { context, recorded } = toolContext({ server, userId: owner.id });
  const result = await callAgentTool({ tool: AgentTool.RotateShareLink, input: { documentId, role: 'admin' }, context });
  expect([result.isError, recorded, server.services.shareLinks.links(documentId)]).toEqual([true, [], before]);
});

test('export_docx on a room nobody opened returns the stored file without opening a session', async () => {
  vi.spyOn(server.services.runtime, 'roomModeFor').mockReturnValue({ isSpent: false, roomMode: RoomMode.Create });
  await server.services.storage.put({ documentId, bytes: DOCX_BYTES });
  const { context, recorded } = toolContext({ server, userId: reader.id });
  const result = await callAgentTool({ tool: AgentTool.ExportDocx, input: { documentId }, context });
  expect(result.content).toEqual([
    {
      type: 'resource',
      resource: { uri: expect.stringContaining(documentId), mimeType: DOCX_MIME_TYPE, blob: DOCX_BYTES.toString('base64') },
    },
  ]);
  expect(recorded).toEqual([{ documentId, userId: reader.id, kind: AgentActionKind.DocumentExported }]);
});

test.each([
  { field: 'edits', input: { action: 'replace_text', edits: Array.from({ length: MAX_EDITS + 1 }, () => EDITS[0]) } },
  { field: 'texts', input: { action: 'insert_paragraphs', texts: Array.from({ length: MAX_TEXTS + 1 }, () => 'One') } },
  { field: 'text', input: { action: 'insert_heading', level: 1, text: 'x'.repeat(MAX_TEXT_LENGTH + 1) } },
])('edit_document refuses $field beyond its limit and dispatches nothing', async ({ field, input }) => {
  const dispatch = vi.fn();
  const { context } = toolContext({ server, userId: editor.id, sessions: sessionsOn({ save: vi.fn() }), dispatch });
  const result = await callAgentTool({ tool: AgentTool.EditDocument, input: { documentId, ...input }, context });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(resultJson(result))).toContain(field);
  expect(dispatch).not.toHaveBeenCalled();
});

test.each(['failed', 'partial', 'aborted'])('edit_document turns a %s receipt into a tool error carrying the reason', async (status) => {
  const receipt = {
    status,
    errors: [{ code: 'MATCH_NOT_FOUND', message: 'The text to replace is not in the document' }],
    nextStep: 'Inspect the document and retry with text it contains',
  };
  const { context } = toolContext({ server, userId: editor.id, sessions: sessionsOn({}), dispatch: vi.fn().mockResolvedValue(receipt) });
  const result = await callAgentTool({
    tool: AgentTool.EditDocument,
    input: { documentId, action: 'replace_text', edits: EDITS },
    context,
  });
  expect(result.isError).toBe(true);
  expect(resultJson(result)).toEqual({
    error: expect.stringContaining('MATCH_NOT_FOUND'),
    status,
    nextStep: receipt.nextStep,
  });
});

test('edit_document without errors in a failed receipt still names the status', async () => {
  const { context } = toolContext({
    server,
    userId: editor.id,
    sessions: sessionsOn({}),
    dispatch: vi.fn().mockResolvedValue({ status: 'failed' }),
  });
  const result = await callAgentTool({
    tool: AgentTool.EditDocument,
    input: { documentId, action: 'replace_text', edits: EDITS },
    context,
  });
  expect([result.isError, resultJson(result)]).toEqual([true, { error: expect.stringContaining('failed'), status: 'failed' }]);
});
