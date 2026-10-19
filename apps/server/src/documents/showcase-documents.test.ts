import { SHOWCASE_TITLE } from '@superdoc-collab/types';
import { isDocx } from '@superdoc-collab/history';
import { expect, test, vi } from 'vitest';
import { signedInUser, startTestServer } from '../testing/test-server';
import { ShowcaseDocuments } from './showcase-documents';

const NOW = Date.UTC(2026, 9, 19, 12, 0);
const STORAGE_FAILURE = new Error('disk full');

test('creates the row, stores a docx and schedules the import of its revisions', async () => {
  const server = await startTestServer();
  const owner = await signedInUser({ server, name: 'Eve' });
  const importRevisions = vi.spyOn(server.services.runtime, 'importRevisions');
  const showcase = new ShowcaseDocuments({ ...server.services, now: () => NOW });
  const documentId = await showcase.create({ ownerUserId: owner.id });
  const summary = server.services.documents.summary({ documentId, userId: owner.id });
  expect(summary).toMatchObject({ title: SHOWCASE_TITLE, role: 'owner' });
  expect(await isDocx(await server.services.storage.read(documentId))).toBe(true);
  expect(importRevisions).toHaveBeenCalledWith(documentId);
  await server.stop();
});

test('a second call makes a second document', async () => {
  const server = await startTestServer();
  const showcase = new ShowcaseDocuments({ ...server.services, now: () => NOW });
  const first = await showcase.create({ ownerUserId: server.admin.id });
  const second = await showcase.create({ ownerUserId: server.admin.id });
  expect(second).not.toBe(first);
  expect(server.services.documents.list(server.admin.id).mine).toHaveLength(2);
  await server.stop();
});

test('a storage failure removes the row and rethrows', async () => {
  const server = await startTestServer();
  const failingStorage = { ...server.services.storage, put: vi.fn().mockRejectedValue(STORAGE_FAILURE) };
  const showcase = new ShowcaseDocuments({ ...server.services, storage: failingStorage, now: () => NOW });
  await expect(showcase.create({ ownerUserId: server.admin.id })).rejects.toBe(STORAGE_FAILURE);
  expect(server.services.documents.list(server.admin.id).mine).toEqual([]);
  await server.stop();
});
