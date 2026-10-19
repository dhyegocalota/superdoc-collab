import { MigrationSet, ReadModel, UpdateLog } from '@superdoc-collab/history';
import { openTestDatabase } from '@superdoc-collab/history/testing';
import { ClientActor } from '@superdoc-collab/types';
import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { findDocumentsToProject } from './pending-documents';

const DOCUMENT_ID = 'document-1';

function projectedStores() {
  const historySqlite = openTestDatabase({ set: MigrationSet.History });
  const readModelSqlite = openTestDatabase({ set: MigrationSet.ReadModel });
  const document = new Y.Doc();
  document.on('update', (update: Uint8Array) =>
    new UpdateLog(historySqlite).append({
      documentName: DOCUMENT_ID,
      connectionUserId: 'ana',
      connectionActor: ClientActor.Human,
      update,
    }),
  );
  document.getMap('content').set('key', 'value');
  return { historySqlite, readModelSqlite, readModel: new ReadModel(readModelSqlite) };
}

test('a projected document with no preview row is found again, and not once it has one', () => {
  const { historySqlite, readModelSqlite, readModel } = projectedStores();
  const [logged] = new UpdateLog(historySqlite).read({ documentName: DOCUMENT_ID, untilSequence: Number.MAX_SAFE_INTEGER });
  readModel.commit({ documentName: DOCUMENT_ID, events: [], marks: [], lastSequence: logged!.sequence });
  expect(findDocumentsToProject({ historySqlite, readModelSqlite })).toEqual([DOCUMENT_ID]);
  readModel.commit({ documentName: DOCUMENT_ID, events: [], marks: [], lastSequence: logged!.sequence, preview: 'Text' });
  expect(findDocumentsToProject({ historySqlite, readModelSqlite })).toEqual([]);
});
