import {
  DOCX_MIME_TYPE,
  AgentActionKind,
  AgentTool,
  DocumentRole,
  ShareLinkRole,
  type DocumentMembers,
  type ShareLinks,
} from '@superdoc-history/types';
import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { memberWithRole, documentWithOwner } from '../testing/collaboration-client';
import type { TestServer, TestUser } from '../testing/test-server';
import { resultJson, sessionsOn, toolContext } from './agent-tool-fixtures';
import { callAgentTool } from './agent-tools';

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

test('export_docx removes the temporary file and records nothing when the save fails', async () => {
  const written: string[] = [];
  const save = vi.fn(async ({ out }: { out: string }) => {
    written.push(out);
    throw new Error('the room is gone');
  });
  const { context, recorded } = toolContext({ server, userId: reader.id, sessions: sessionsOn({ save }) });
  await expect(callAgentTool({ tool: AgentTool.ExportDocx, input: { documentId }, context })).rejects.toThrow('the room is gone');
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

test('get_share_links gives the owner both links and records the reveal, and an editor gets the role error', async () => {
  const asOwner = toolContext({ server, userId: owner.id });
  const links = resultJson(
    await callAgentTool({ tool: AgentTool.GetShareLinks, input: { documentId }, context: asOwner.context }),
  ) as ShareLinks;
  expect(links).toEqual(server.services.shareLinks.links(documentId));
  expect(asOwner.recorded).toEqual([{ documentId, userId: owner.id, kind: AgentActionKind.ShareLinkRevealed }]);
  const asEditor = toolContext({ server, userId: editor.id });
  const refused = await callAgentTool({ tool: AgentTool.GetShareLinks, input: { documentId }, context: asEditor.context });
  expect([refused.isError, asEditor.recorded]).toEqual([true, []]);
});

test.each(Object.values(ShareLinkRole))('rotate_share_link rotates only the %s link and records it', async (role) => {
  const before = server.services.shareLinks.links(documentId);
  const { context, recorded } = toolContext({ server, userId: owner.id });
  const rotated = resultJson(await callAgentTool({ tool: AgentTool.RotateShareLink, input: { documentId, role }, context })) as ShareLinks;
  const untouched = Object.values(ShareLinkRole).filter((other) => other !== role);
  expect(rotated[role]).not.toBe(before[role]);
  untouched.forEach((other) => expect(rotated[other]).toBe(before[other]));
  expect(server.services.shareLinks.links(documentId)).toEqual(rotated);
  expect(recorded).toEqual([{ documentId, userId: owner.id, kind: AgentActionKind.ShareLinkRotated }]);
});

test('rotate_share_link with an unknown role is a tool error and rotates nothing', async () => {
  const before = server.services.shareLinks.links(documentId);
  const { context, recorded } = toolContext({ server, userId: owner.id });
  const result = await callAgentTool({ tool: AgentTool.RotateShareLink, input: { documentId, role: 'admin' }, context });
  expect([result.isError, recorded, server.services.shareLinks.links(documentId)]).toEqual([true, [], before]);
});
