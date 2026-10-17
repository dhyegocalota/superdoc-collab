import { DocumentRole } from '@superdoc-history/types';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { signedInOwner, signedInUser, type TestServer, type TestUser } from '../testing/test-server';
import type { AgentPerson } from './agent-tool-context';
import { seededDocument } from './agent-tool-fixtures';

const OWNER_AGENT_NAME = 'Ana · AI';
const READER_NAME = 'Reader';
const SECOND_NAME = 'Bruno';
const SECOND_AGENT_NAME = 'Bruno · AI';
const FIRST_EDIT = { find: 'Budget', replace: 'Plan' };
const SECOND_EDIT = { find: 'approved', replace: 'pending' };
const PERFORM_ACTION = 'superdoc_perform_action';
const REPLACE_TEXT = 'replace_text';
const TRACKED = 'tracked';

let server: TestServer;
let owner: TestUser;
let second: TestUser;
let reader: TestUser;
let documentId: string;

function personOf(user: TestUser, name: string): AgentPerson {
  return { userId: user.id, name, email: user.email };
}

beforeAll(async () => {
  ({ server, owner } = await signedInOwner());
  documentId = await seededDocument({ server, owner });
  second = await signedInUser({ server, name: SECOND_NAME });
  server.services.documents.grant({ documentId, userId: second.id, role: DocumentRole.Editor });
  reader = await signedInUser({ server, name: READER_NAME });
  server.services.documents.grant({ documentId, userId: reader.id, role: DocumentRole.Reader });
});

afterAll(async () => {
  await server.stop();
});

function replaceAs({ user, name, edit }: { user: TestUser; name: string; edit: { find: string; replace: string } }): Promise<unknown> {
  return server.services.agentSessions.run({
    person: personOf(user, name),
    documentId,
    work: (document) =>
      server.services.agentToolkit.dispatch(document, PERFORM_ACTION, { action: REPLACE_TEXT, edits: [edit], changeMode: TRACKED }),
  });
}

test('a session opened for Ana signs tracked changes as Ana · AI', async () => {
  await replaceAs({ user: owner, name: 'Ana', edit: FIRST_EDIT });
  const listed = await server.services.agentSessions.run({
    person: personOf(reader, READER_NAME),
    documentId,
    work: (document) => document.trackChanges.list({}),
  });
  expect(JSON.stringify(listed)).toContain(OWNER_AGENT_NAME);
});

test('a second person on the same host keeps their own name', async () => {
  await replaceAs({ user: second, name: SECOND_NAME, edit: SECOND_EDIT });
  const listed = JSON.stringify(
    await server.services.agentSessions.run({
      person: personOf(reader, READER_NAME),
      documentId,
      work: (document) => document.trackChanges.list({}),
    }),
  );
  expect(listed).toContain(OWNER_AGENT_NAME);
  expect(listed).toContain(SECOND_AGENT_NAME);
});
