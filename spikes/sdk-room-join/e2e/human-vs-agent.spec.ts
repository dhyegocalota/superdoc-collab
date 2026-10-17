import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCollaborationServer, type RunningCollaborationServer } from '../collaboration-server';
import { readMainStoryText } from '../document-content';
import { COLLABORATION_PORT, decideClientTrackedChange, expectClientText, openHuman, readClientText, readClientTrackedChanges, startAgent, typeInParagraph, type Agent } from './harness';

const DOCUMENT_ID = 'human-vs-agent';
const AGENT_TOKEN = 'history-agent';
const AGENT_NAME = 'History Agent';
const HUMAN_A = 'ana';
const HUMAN_B = 'bruno';
const TYPING_DELAY_MS = 40;
const EXPECTED_TOOLS = ['superdoc_open', 'superdoc_inspect', 'superdoc_perform_action', 'superdoc_save', 'superdoc_close'];

type Receipt = { status: string; postSnapshot?: { counts?: { trackedChanges?: number } }; errors?: unknown[] };
type Inspection = { counts: { paragraphs: number; trackedChanges: number }; blocks: Array<{ text: string }> };

let collaboration: RunningCollaborationServer;
let agent: Agent;
let ana: Page;
let sessionId = '';

function serverText(): string {
  return readMainStoryText(collaboration.roomDocument(DOCUMENT_ID));
}

async function inspect(): Promise<Inspection> {
  return agent.call<Inspection>('superdoc_inspect', { session_id: sessionId });
}

function inspectedText(inspection: Inspection): string {
  return inspection.blocks.map((block) => block.text).join('');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  collaboration = await startCollaborationServer(COLLABORATION_PORT);
  ana = await openHuman({ browser, author: HUMAN_A, mode: 'create', documentId: DOCUMENT_ID });
  await expect.poll(() => serverText()).toContain(`owned by ${HUMAN_A}`);
  agent = await startAgent({ token: AGENT_TOKEN, name: AGENT_NAME });
});

test.afterAll(async () => {
  await agent.stop();
  await collaboration.stop();
});

test('M1 the MCP server lists the five SuperDoc lifecycle tools', async () => {
  const names = (await agent.listTools()).map((tool) => tool.name);
  expect(names.sort()).toEqual([...EXPECTED_TOOLS].sort());
});

test('M2 superdoc_open joins the room the human created and inspect reads the seed', async () => {
  const opened = await agent.call<{ session_id: string }>('superdoc_open', { document_id: DOCUMENT_ID });
  sessionId = opened.session_id;
  expect(collaboration.authenticatedTokens).toContain(AGENT_TOKEN);
  const inspection = await inspect();
  expect(inspection.counts.paragraphs).toBe(4);
  expect(inspectedText(inspection)).toBe(await readClientText(ana));
});

test('M3 the agent sees what the human types, live', async () => {
  const marker = ' <ANA-LIVE>';
  await typeInParagraph({ page: ana, paragraphOwner: HUMAN_A, text: marker, delayMs: TYPING_DELAY_MS });
  await expect.poll(async () => inspectedText(await inspect()), { timeout: 30_000 }).toContain(marker.trim());
});

test('M4 the human sees a tracked replace_text by the agent, with the agent as author', async () => {
  const receipt = await agent.call<Receipt>('superdoc_perform_action', { session_id: sessionId, action: 'replace_text', edits: [{ find: 'owned by bruno', replace: 'owned by BRUNO-AGENT' }], changeMode: 'tracked' });
  expect(receipt.status).toBe('ok');
  await expectClientText({ pages: [ana], isComplete: (text) => text.includes('BRUNO-AGENT') });
  const tracked = await readClientTrackedChanges(ana);
  expect(tracked.length).toBeGreaterThan(0);
  expect(JSON.stringify(tracked)).toContain(AGENT_NAME);
});

test('M5 the human sees new paragraphs and a heading inserted by the agent', async () => {
  const paragraphs = await agent.call<Receipt>('superdoc_perform_action', { session_id: sessionId, action: 'insert_paragraphs', texts: ['Agent paragraph one.', 'Agent paragraph two.'], changeMode: 'tracked' });
  expect(paragraphs.status).toBe('ok');
  const heading = await agent.call<Receipt>('superdoc_perform_action', { session_id: sessionId, action: 'insert_heading', text: 'Agent heading', level: 1, changeMode: 'tracked' });
  expect(heading.status).toBe('ok');
  await expectClientText({ pages: [ana], isComplete: (text) => text.includes('Agent paragraph one.') && text.includes('Agent paragraph two.') && text.includes('Agent heading') });
});

test('M6 human and agent edit at the same time and every client converges with the server', async () => {
  const marker = ' <ANA-CONCURRENT>';
  const [receipt] = await Promise.all([
    agent.call<Receipt>('superdoc_perform_action', { session_id: sessionId, action: 'replace_text', edits: [{ find: 'owned by caio', replace: 'owned by CAIO-AGENT' }], changeMode: 'tracked' }),
    typeInParagraph({ page: ana, paragraphOwner: HUMAN_A, text: marker, delayMs: TYPING_DELAY_MS }),
  ]);
  expect(receipt.status).toBe('ok');
  const converged = await expectClientText({ pages: [ana], isComplete: (text) => text.includes('CAIO-AGENT') && text.includes(marker.trim()) });
  await expect.poll(() => serverText()).toBe(converged);
  await expect.poll(async () => inspectedText(await inspect())).toBe(converged);
});

test('M7 the human accepts one agent change and the agent observes it', async () => {
  const before = await readClientTrackedChanges(ana);
  const open = before.filter((change) => change.state === 'open');
  expect(open.length).toBeGreaterThan(0);
  await decideClientTrackedChange({ page: ana, id: open[0].id, decision: 'accept' });
  await expect.poll(async () => (await inspect()).counts.trackedChanges, { timeout: 30_000 }).toBeLessThan(open.length);
});

test('M8 a second human joins late and sees the merged state', async ({ browser }) => {
  const bruno = await openHuman({ browser, author: HUMAN_B, mode: 'join', documentId: DOCUMENT_ID });
  const converged = await expectClientText({ pages: [ana, bruno], isComplete: (text) => text.includes('CAIO-AGENT') && text.includes('<ANA-LIVE>') });
  expect(converged).toBe(serverText());
  await bruno.close();
});

test('M9 superdoc_save exports the live room as DOCX and superdoc_close leaves the edits in place', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'spike-save-')), 'exported.docx');
  await agent.call('superdoc_save', { session_id: sessionId, out });
  expect(existsSync(out)).toBe(true);
  expect(statSync(out).size).toBeGreaterThan(0);
  const textBefore = serverText();
  await agent.call('superdoc_close', { session_id: sessionId });
  await expect.poll(() => serverText()).toBe(textBefore);
  const humanUpdates = collaboration.updates.filter((update) => update.userId === `${HUMAN_A}@example.com`).length;
  const agentUpdates = collaboration.updates.filter((update) => update.userId === AGENT_TOKEN).length;
  console.log('updates by human:', humanUpdates, 'by agent:', agentUpdates);
  expect(humanUpdates).toBeGreaterThan(0);
  expect(agentUpdates).toBeGreaterThan(0);
});
