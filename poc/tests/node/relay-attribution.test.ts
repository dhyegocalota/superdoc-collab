import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { resolveAuthorIds } from '../../lib/edit-events';
import { IdentitySource, UpdateLog } from '../../lib/update-log';

const DOCUMENT = 'relay-room';
const ANA = 'ana@example.com';
const BRUNO = 'bruno@example.com';

function freshLogPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'poc-relay-')), 'history.sqlite');
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
  const log = new UpdateLog(freshLogPath());
  const { anaClientId, relayedByBruno } = relayScenario();
  const logged = log.append({ documentName: DOCUMENT, connectionUserId: BRUNO, update: relayedByBruno });
  expect(log.identitySources(DOCUMENT).get(anaClientId)).toBe(IdentitySource.Observed);
  expect(resolveAuthorIds({ update: logged, identities: log.clientIdentities(DOCUMENT) })).toEqual([BRUNO]);
  log.close();
});

test('a later declaration by the owner corrects the provisional binding', () => {
  const log = new UpdateLog(freshLogPath());
  const { anaClientId, relayedByBruno } = relayScenario();
  const logged = log.append({ documentName: DOCUMENT, connectionUserId: BRUNO, update: relayedByBruno });
  log.declareClientIdentity({ documentName: DOCUMENT, yjsClientId: anaClientId, userId: ANA });
  expect(resolveAuthorIds({ update: logged, identities: log.clientIdentities(DOCUMENT) })).toEqual([ANA, BRUNO]);
  log.close();
});

test('a declaration persisted before a crash wins over a relay after the restart', () => {
  const path = freshLogPath();
  const { anaClientId, relayedByBruno } = relayScenario();
  const beforeCrash = new UpdateLog(path);
  beforeCrash.declareClientIdentity({ documentName: DOCUMENT, yjsClientId: anaClientId, userId: ANA });
  beforeCrash.close();

  const afterRestart = new UpdateLog(path);
  const logged = afterRestart.append({ documentName: DOCUMENT, connectionUserId: BRUNO, update: relayedByBruno });
  expect(resolveAuthorIds({ update: logged, identities: afterRestart.clientIdentities(DOCUMENT) })).toEqual([ANA, BRUNO]);
  afterRestart.close();
});

test('a declaration never overrides another declaration', () => {
  const log = new UpdateLog(freshLogPath());
  log.declareClientIdentity({ documentName: DOCUMENT, yjsClientId: 42, userId: ANA });
  log.declareClientIdentity({ documentName: DOCUMENT, yjsClientId: 42, userId: BRUNO });
  expect(log.clientIdentities(DOCUMENT).get(42)).toBe(ANA);
  log.close();
});
