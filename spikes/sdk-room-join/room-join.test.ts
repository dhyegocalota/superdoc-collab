import { createAgentToolkit, createSuperDocClient, type SuperDocClient } from '@superdoc/sdk';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startCollaborationServer, type RunningCollaborationServer } from './collaboration-server';
import { readMainStoryText } from './document-content';

const PORT = 4711;
const DOCUMENT_ID = 'spike-room';
const SEED_PATH = join(import.meta.dirname, 'seed.docx');
const AGENT_TOKEN = 'agent-user';
const REVIEWER_TOKEN = 'reviewer-user';
const BOOTSTRAP_TOKEN = 'bootstrap-worker';
const AGENT_NAME = 'History Agent';
const INSERTED_TEXT = 'AGENT-EDIT';
const SETTLE_MS = 1500;

let collaboration: RunningCollaborationServer;
const clients: SuperDocClient[] = [];

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function openRoom({ token, roomMode, userName }: { token: string; roomMode: 'create' | 'join'; userName: string }) {
  const client = createSuperDocClient({ user: { name: userName, email: `${token}@spike.test` }, stateDir: mkdtempSync(join(tmpdir(), 'spike-')) });
  await client.connect();
  clients.push(client);
  const doc = await client.open(
    { runtime: 'v2', doc: roomMode === 'create' ? SEED_PATH : undefined, collaboration: { providerType: 'hocuspocus', url: collaboration.url, documentId: DOCUMENT_ID, roomMode } },
    { collaborationAuth: { type: 'token', token } },
  );
  return { client, doc };
}

beforeAll(async () => {
  collaboration = await startCollaborationServer(PORT);
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.dispose().catch(() => undefined)));
  await collaboration.stop();
});

describe('SuperDoc SDK against a live Hocuspocus room', () => {
  let seedText = '';
  let targetWord = '';

  it('S1 creates the room from a DOCX (roomMode create)', async () => {
    const { doc } = await openRoom({ token: BOOTSTRAP_TOKEN, roomMode: 'create', userName: 'Bootstrap' });
    await wait(SETTLE_MS);
    seedText = readMainStoryText(collaboration.roomDocument(DOCUMENT_ID));
    console.log('server text after create:', JSON.stringify(seedText.slice(0, 200)));
    expect(seedText.length).toBeGreaterThan(20);
    expect(collaboration.authenticatedTokens).toContain(BOOTSTRAP_TOKEN);
    targetWord = seedText.split(/\s+/).find((word) => word.length >= 5 && /^[A-Za-z]+$/.test(word)) ?? '';
    expect(targetWord).not.toBe('');
    await doc.close({ discard: true });
  });

  it('S2 joins the room with a per-open token and applies a tracked replace that reaches the server', async () => {
    const { doc } = await openRoom({ token: AGENT_TOKEN, roomMode: 'join', userName: AGENT_NAME });
    const matches = (await doc.query.match({ select: { type: 'text', pattern: targetWord }, limit: 1 } as never)) as unknown as { matches?: unknown[]; items?: unknown[] };
    console.log('query.match result keys:', Object.keys(matches));
    const first = (matches.matches ?? matches.items ?? [])[0] as { target?: unknown; address?: unknown } | undefined;
    expect(first).toBeDefined();
    const updatesBefore = collaboration.updates.length;
    const receipt = await doc.replace({ target: first!.target ?? first!.address, text: INSERTED_TEXT, changeMode: 'tracked' } as never);
    console.log('replace receipt:', JSON.stringify(receipt).slice(0, 300));
    await wait(SETTLE_MS);
    const serverText = readMainStoryText(collaboration.roomDocument(DOCUMENT_ID));
    expect(serverText).toContain(INSERTED_TEXT);
    const agentUpdates = collaboration.updates.slice(updatesBefore).filter((update) => update.userId === AGENT_TOKEN);
    console.log('updates by agent connection:', agentUpdates.length, 'of', collaboration.updates.length - updatesBefore);
    expect(agentUpdates.length).toBeGreaterThan(0);
    console.log('awareness states:', JSON.stringify([...collaboration.awarenessUsers.values()]).slice(0, 400));
    await doc.close({ discard: true });
  });

  it('S3 a second joiner sees the tracked change with the agent as author', async () => {
    const { doc } = await openRoom({ token: REVIEWER_TOKEN, roomMode: 'join', userName: 'Reviewer' });
    const listed = (await doc.trackChanges.list({})) as unknown as { items: Array<{ author?: unknown; authorName?: string; text?: string; insertedText?: string }> };
    console.log('tracked changes seen by reviewer:', JSON.stringify(listed).slice(0, 600));
    expect(listed.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(listed)).toContain(AGENT_NAME);
    expect(JSON.stringify(listed)).toContain(INSERTED_TEXT);
    await doc.close({ discard: true });
  });

  it('S4 the Vercel-shaped agent toolkit dispatches a tracked edit against the live room', async () => {
    const toolkit = await createAgentToolkit({ provider: 'vercel', preset: 'core', enforceChangeMode: 'tracked' } as never);
    console.log('toolkit meta:', JSON.stringify(toolkit.meta), 'tool names:', JSON.stringify(toolkit.tools.map((tool) => (tool as { name?: string }).name ?? Object.keys(tool as object))));
    expect(toolkit.tools.length).toBeGreaterThan(0);
    const { doc } = await openRoom({ token: AGENT_TOKEN, roomMode: 'join', userName: AGENT_NAME });
    const inspected = await toolkit.dispatch(doc as never, 'superdoc_inspect', {});
    console.log('inspect:', JSON.stringify(inspected).slice(0, 400));
    const updatesBefore = collaboration.updates.length;
    const receipt = await toolkit.dispatch(doc as never, 'superdoc_perform_action', { action: 'replace_text', edits: [{ find: INSERTED_TEXT, replace: 'TOOLKIT-EDIT' }], changeMode: 'tracked' } as never).catch((error: Error) => ({ error: error.message }));
    console.log('perform_action receipt:', JSON.stringify(receipt).slice(0, 600));
    await wait(SETTLE_MS);
    const serverText = readMainStoryText(collaboration.roomDocument(DOCUMENT_ID));
    console.log('server text tail:', JSON.stringify(serverText.slice(-120)));
    expect(serverText).toContain('TOOLKIT-EDIT');
    expect(collaboration.updates.slice(updatesBefore).some((update) => update.userId === AGENT_TOKEN)).toBe(true);
    await doc.close({ discard: true });
  });
});
