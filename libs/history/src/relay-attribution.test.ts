import { ClientActor } from '@superdoc-collab/types';
import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { resolveAuthorIds } from './edit-events';
import { MigrationSet } from './migrations';
import { openTestDatabase, temporaryDatabasePath } from './testing';
import { IdentitySource, UpdateLog } from './update-log';

const DOCUMENT = 'relay-room';
const ANA = 'ana@example.com';
const BRUNO = 'bruno@example.com';

function openLog(path = temporaryDatabasePath(MigrationSet.History)): { log: UpdateLog; close: () => void } {
  const sqlite = openTestDatabase({ set: MigrationSet.History, path });
  return { log: new UpdateLog(sqlite), close: () => sqlite.close() };
}

function relayScenario() {
  const anaDocument = new Y.Doc();
  const brunoDocument = new Y.Doc();
  anaDocument.getText('t').insert(0, 'ana typed this');
  const lostAnaUpdate = Y.encodeStateAsUpdate(anaDocument);
  Y.applyUpdate(brunoDocument, lostAnaUpdate);
  brunoDocument.getText('t').insert(0, 'bruno ');
  const relayedByBruno = Y.encodeStateAsUpdate(brunoDocument);
  return { anaClientId: anaDocument.clientID, brunoClientId: brunoDocument.clientID, relayedByBruno };
}

test('without a declaration, a relayed update is provisionally attributed to the relaying connection', () => {
  const { log, close } = openLog();
  const { anaClientId, relayedByBruno } = relayScenario();
  const logged = log.append({
    documentName: DOCUMENT,
    connectionUserId: BRUNO,
    connectionActor: ClientActor.Human,
    update: relayedByBruno,
  });
  expect(log.identitySources(DOCUMENT).get(anaClientId)).toBe(IdentitySource.Observed);
  expect(resolveAuthorIds({ update: logged, identities: log.clientIdentities(DOCUMENT) })).toEqual([
    { userId: BRUNO, actor: ClientActor.Human },
  ]);
  close();
});

test('a later declaration by the owner corrects the provisional binding', () => {
  const { log, close } = openLog();
  const { anaClientId, relayedByBruno } = relayScenario();
  const logged = log.append({
    documentName: DOCUMENT,
    connectionUserId: BRUNO,
    connectionActor: ClientActor.Human,
    update: relayedByBruno,
  });
  log.declareClientIdentity({ documentName: DOCUMENT, yjsClientId: anaClientId, userId: ANA, actor: ClientActor.Human });
  expect(resolveAuthorIds({ update: logged, identities: log.clientIdentities(DOCUMENT) })).toEqual([
    { userId: ANA, actor: ClientActor.Human },
    { userId: BRUNO, actor: ClientActor.Human },
  ]);
  close();
});

test('a declaration persisted before a crash wins over a relay after the restart', () => {
  const path = temporaryDatabasePath(MigrationSet.History);
  const { anaClientId, relayedByBruno } = relayScenario();
  const { log: beforeCrash, close: closeBeforeCrash } = openLog(path);
  beforeCrash.declareClientIdentity({ documentName: DOCUMENT, yjsClientId: anaClientId, userId: ANA, actor: ClientActor.Human });
  closeBeforeCrash();

  const { log: afterRestart, close: closeAfterRestart } = openLog(path);
  const logged = afterRestart.append({
    documentName: DOCUMENT,
    connectionUserId: BRUNO,
    connectionActor: ClientActor.Human,
    update: relayedByBruno,
  });
  expect(resolveAuthorIds({ update: logged, identities: afterRestart.clientIdentities(DOCUMENT) })).toEqual([
    { userId: ANA, actor: ClientActor.Human },
    { userId: BRUNO, actor: ClientActor.Human },
  ]);
  closeAfterRestart();
});

test('a declaration never overrides another declaration', () => {
  const { log, close } = openLog();
  log.declareClientIdentity({ documentName: DOCUMENT, yjsClientId: 42, userId: ANA, actor: ClientActor.Human });
  log.declareClientIdentity({ documentName: DOCUMENT, yjsClientId: 42, userId: BRUNO, actor: ClientActor.Human });
  expect(log.clientIdentities(DOCUMENT).get(42)).toEqual({ userId: ANA, actor: ClientActor.Human });
  close();
});

test('a human declaration never claims an agent clientId', () => {
  const { log, close } = openLog();
  log.observeClientIdentity({ documentName: DOCUMENT, yjsClientId: 42, userId: ANA, actor: ClientActor.Agent });
  log.declareClientIdentity({ documentName: DOCUMENT, yjsClientId: 42, userId: ANA, actor: ClientActor.Human });
  expect(log.identitySources(DOCUMENT).get(42)).toBe(IdentitySource.Observed);
  expect(log.clientIdentities(DOCUMENT).get(42)).toEqual({ userId: ANA, actor: ClientActor.Agent });
  close();
});

test('an agent struct resolves to its user with the agent actor and a deletion-only update to the connection actor', () => {
  const { log, close } = openLog();
  const { anaClientId, brunoClientId, relayedByBruno } = relayScenario();
  log.observeClientIdentity({ documentName: DOCUMENT, yjsClientId: anaClientId, userId: ANA, actor: ClientActor.Agent });
  log.observeClientIdentity({ documentName: DOCUMENT, yjsClientId: brunoClientId, userId: BRUNO, actor: ClientActor.Human });
  const logged = log.append({ documentName: DOCUMENT, connectionUserId: ANA, connectionActor: ClientActor.Agent, update: relayedByBruno });
  const identities = log.clientIdentities(DOCUMENT);
  expect(resolveAuthorIds({ update: logged, identities })).toEqual([
    { userId: ANA, actor: ClientActor.Agent },
    { userId: BRUNO, actor: ClientActor.Human },
  ]);
  expect(resolveAuthorIds({ update: { ...logged, yjsClientIds: [] }, identities })).toEqual([{ userId: ANA, actor: ClientActor.Agent }]);
  close();
});
