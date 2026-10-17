import {
  AgentScope,
  AgentTool,
  DocumentRole,
  SELECTION_SUMMARY_TOO_SOON_MESSAGE,
  type DocumentsList,
  type DocumentTopics,
  UTC_TIME_ZONE,
} from '@superdoc-collab/types';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { LLM_BUSY_MESSAGE } from '../insights/llm-client';
import { JobOutcome } from '../insights/insights-job-runner';
import { modelAnswering, readyModel } from '../testing/language-model';
import { documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { commitBulkEvents, readTimeline, readTopics } from '../testing/timeline-client';
import { signedInUser, type TestServer, type TestUser } from '../testing/test-server';
import { ALL_AGENT_SCOPES, resultJson, toolContext } from './agent-tool-fixtures';
import { callAgentTool, DOCUMENT_NOT_FOUND_MESSAGE, FORBIDDEN_TOOL_MESSAGE, roleTooLowMessage } from './agent-tools';

const TOOL_RULES = [
  { tool: AgentTool.ListDocuments, scope: AgentScope.HistoryRead, minimumRole: DocumentRole.Reader },
  { tool: AgentTool.GetTimeline, scope: AgentScope.HistoryRead, minimumRole: DocumentRole.Reader },
  { tool: AgentTool.GetBinEdits, scope: AgentScope.HistoryRead, minimumRole: DocumentRole.Reader },
  { tool: AgentTool.ListTopics, scope: AgentScope.HistoryRead, minimumRole: DocumentRole.Reader },
  { tool: AgentTool.SummarizeSelection, scope: AgentScope.HistoryRead, minimumRole: DocumentRole.Editor },
  { tool: AgentTool.InspectDocument, scope: AgentScope.DocumentEdit, minimumRole: DocumentRole.Editor },
  { tool: AgentTool.EditDocument, scope: AgentScope.DocumentEdit, minimumRole: DocumentRole.Editor },
  { tool: AgentTool.ExportDocx, scope: AgentScope.DocumentExport, minimumRole: DocumentRole.Reader },
  { tool: AgentTool.ListMembers, scope: AgentScope.DocumentShare, minimumRole: DocumentRole.Reader },
  { tool: AgentTool.GetShareLinks, scope: AgentScope.DocumentShare, minimumRole: DocumentRole.Owner },
  { tool: AgentTool.RotateShareLink, scope: AgentScope.DocumentShare, minimumRole: DocumentRole.Owner },
];
const TOOLS_ON_A_DOCUMENT = TOOL_RULES.filter(({ tool }) => tool !== AgentTool.ListDocuments);
const TOOLS_ABOVE_READER = TOOL_RULES.filter(({ minimumRole }) => minimumRole !== DocumentRole.Reader);
const ROLE_BELOW: Record<DocumentRole, DocumentRole> = {
  [DocumentRole.Owner]: DocumentRole.Editor,
  [DocumentRole.Editor]: DocumentRole.Reader,
  [DocumentRole.Reader]: DocumentRole.Reader,
};
const SELECTION_ANSWER = { sentence: 'Ana added text.', authors: ['Ana'] };
const OWNER_SELECTION = { author: 'ana', timeZone: UTC_TIME_ZONE };
const OTHER_SELECTION = { term: 'x', timeZone: UTC_TIME_ZONE };
const EVENT_COUNT = 3;

let server: TestServer;
let documentId: string;
let owner: TestUser;
let editor: TestUser;
let reader: TestUser;
let outsider: TestUser;

beforeAll(async () => {
  const model = modelAnswering(SELECTION_ANSWER);
  ({ server, documentId, owner } = await documentWithOwner({ languageModel: readyModel(model) }));
  commitBulkEvents({ server, documentId, userId: owner.id, count: EVENT_COUNT });
  editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  outsider = await signedInUser({ server, name: 'Outsider' });
});

afterAll(async () => {
  await server.stop();
});

function userWithRole(role: DocumentRole): TestUser {
  return { [DocumentRole.Owner]: owner, [DocumentRole.Editor]: editor, [DocumentRole.Reader]: reader }[role];
}

test.each(TOOL_RULES)('$tool refuses a token without the $scope scope', async ({ tool, scope }) => {
  const scopes = ALL_AGENT_SCOPES.filter((candidate) => candidate !== scope);
  const { context } = toolContext({ server, userId: owner.id, scopes });
  const result = await callAgentTool({ tool, input: { documentId }, context });
  expect(result.isError).toBe(true);
  expect(resultJson(result)).toEqual({ error: FORBIDDEN_TOOL_MESSAGE });
});

test.each(TOOLS_ON_A_DOCUMENT)('$tool answers a non-member that the document is not found', async ({ tool }) => {
  const { context } = toolContext({ server, userId: outsider.id });
  const result = await callAgentTool({ tool, input: { documentId }, context });
  expect(result.isError).toBe(true);
  expect(resultJson(result)).toEqual({ error: DOCUMENT_NOT_FOUND_MESSAGE });
});

test.each(TOOLS_ABOVE_READER)('$tool names the role of a member below $minimumRole', async ({ tool, minimumRole }) => {
  const role = ROLE_BELOW[minimumRole];
  const { context } = toolContext({ server, userId: userWithRole(role).id });
  const result = await callAgentTool({ tool, input: { documentId }, context });
  expect(result.isError).toBe(true);
  expect(resultJson(result)).toEqual({ error: roleTooLowMessage(role) });
});

test('list_documents returns the documents the person is a member of with their role', async () => {
  const listed = async (user: TestUser) => {
    const { context } = toolContext({ server, userId: user.id });
    return resultJson(await callAgentTool({ tool: AgentTool.ListDocuments, input: {}, context })) as DocumentsList;
  };
  expect(await listed(owner)).toMatchObject({ mine: [{ id: documentId, role: DocumentRole.Owner }], shared: [] });
  expect(await listed(reader)).toMatchObject({ mine: [], shared: [{ id: documentId, role: DocumentRole.Reader }] });
  expect(await listed(outsider)).toEqual({ mine: [], shared: [] });
});

test.each([
  { input: {}, query: '' },
  { input: { term: 'x' }, query: 'term=x' },
])('get_timeline returns what the HTTP timeline returns for $input', async ({ input, query }) => {
  const { context } = toolContext({ server, userId: reader.id });
  const result = await callAgentTool({ tool: AgentTool.GetTimeline, input: { documentId, timeZone: UTC_TIME_ZONE, ...input }, context });
  expect(resultJson(result)).toEqual(await readTimeline({ server, documentId, cookie: reader.cookie, query }));
});

test('get_bin_edits returns the edit runs of a bin of the timeline', async () => {
  const timeline = await readTimeline({ server, documentId, cookie: reader.cookie });
  const editedBin = timeline.bins.find((bin) => Object.keys(bin.byBand).length > 0);
  expect(editedBin).toBeDefined();
  const { context } = toolContext({ server, userId: reader.id });
  const result = await callAgentTool({
    tool: AgentTool.GetBinEdits,
    input: { documentId, timeZone: UTC_TIME_ZONE, binStart: editedBin!.start, binMs: timeline.binMs },
    context,
  });
  expect(resultJson(result)).toMatchObject({
    binStart: editedBin!.start,
    binMs: timeline.binMs,
    runs: expect.arrayContaining([expect.anything()]),
  });
});

test('list_topics returns the topics and their status', async () => {
  const { context } = toolContext({ server, userId: reader.id });
  const result = await callAgentTool({ tool: AgentTool.ListTopics, input: { documentId }, context });
  expect(resultJson(result)).toEqual((await readTopics({ server, documentId, cookie: reader.cookie })) satisfies DocumentTopics);
});

test('summarize_selection answers busy with retryAfterSeconds', async () => {
  vi.spyOn(server.services.insights.jobRunner, 'run').mockReturnValue(JobOutcome.Busy);
  const { context } = toolContext({ server, userId: editor.id });
  const result = await callAgentTool({ tool: AgentTool.SummarizeSelection, input: { documentId, ...OTHER_SELECTION }, context });
  expect(result.isError).toBe(true);
  expect(resultJson(result)).toEqual({ error: LLM_BUSY_MESSAGE, retryAfterSeconds: expect.any(Number) });
  vi.restoreAllMocks();
});

test('summarize_selection starts the summary and then reads it, and the cooldown answers with retryAfterSeconds', async () => {
  const { context } = toolContext({ server, userId: editor.id });
  const started = await callAgentTool({ tool: AgentTool.SummarizeSelection, input: { documentId, ...OWNER_SELECTION }, context });
  expect(started.isError).toBeUndefined();
  await server.services.insights.jobRunner.idle();
  const read = await callAgentTool({ tool: AgentTool.SummarizeSelection, input: { documentId, ...OWNER_SELECTION }, context });
  expect(resultJson(read)).toMatchObject({ summary: { sentence: SELECTION_ANSWER.sentence } });
  const tooSoon = await callAgentTool({ tool: AgentTool.SummarizeSelection, input: { documentId, ...OTHER_SELECTION }, context });
  const tooSoonBody = resultJson(tooSoon) as { error: string; retryAfterSeconds: number };
  expect([tooSoon.isError, tooSoonBody.error]).toEqual([true, SELECTION_SUMMARY_TOO_SOON_MESSAGE]);
  expect(tooSoonBody.retryAfterSeconds).toBeGreaterThan(0);
});

test('an input the schema rejects is a tool error that names the field', async () => {
  const { context } = toolContext({ server, userId: reader.id });
  const result = await callAgentTool({ tool: AgentTool.GetBinEdits, input: { documentId, binStart: 'later' }, context });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(resultJson(result))).toContain('binStart');
});

test('list_documents ignores a documentId it does not take', async () => {
  const { context } = toolContext({ server, userId: outsider.id });
  const result = await callAgentTool({ tool: AgentTool.ListDocuments, input: { documentId }, context });
  expect([result.isError, resultJson(result)]).toEqual([undefined, { mine: [], shared: [] }]);
});

test.each(TOOLS_ON_A_DOCUMENT)('$tool without a documentId is a tool error that names it', async ({ tool }) => {
  const { context } = toolContext({ server, userId: owner.id });
  const result = await callAgentTool({ tool, input: {}, context });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(resultJson(result))).toContain('documentId');
});
