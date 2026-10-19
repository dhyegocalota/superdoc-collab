import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { temporaryDirectory } from '../testing/temporary-directory';
import { InvalidDocumentIdError } from './file-storage';
import { createLocalDiskFileStorage } from './local-disk-file-storage';

function storageInTemporaryDirectory() {
  return createLocalDiskFileStorage(join(temporaryDirectory(), 'documents'));
}

test('put then read returns identical bytes', async () => {
  const storage = storageInTemporaryDirectory();
  const documentId = randomUUID();
  const bytes = new Uint8Array([80, 75, 3, 4, 0, 255]);
  await storage.put({ documentId, bytes });
  expect(await storage.read(documentId)).toEqual(bytes);
});

test('remove of a missing id resolves', async () => {
  await expect(storageInTemporaryDirectory().remove(randomUUID())).resolves.toBeUndefined();
});

test('pathOf refuses an id that is not a uuid', () => {
  expect(() => storageInTemporaryDirectory().pathOf('../auth')).toThrow(InvalidDocumentIdError);
});

test('putThumbnail then readThumbnail returns identical bytes and a second put replaces them', async () => {
  const storage = storageInTemporaryDirectory();
  const documentId = randomUUID();
  await storage.putThumbnail({ documentId, bytes: new Uint8Array([1, 2, 3]) });
  expect(await storage.readThumbnail(documentId)).toEqual(new Uint8Array([1, 2, 3]));
  await storage.putThumbnail({ documentId, bytes: new Uint8Array([9]) });
  expect(await storage.readThumbnail(documentId)).toEqual(new Uint8Array([9]));
});

test('remove deletes the thumbnail with the document and keeps the other documents thumbnails', async () => {
  const storage = storageInTemporaryDirectory();
  const removedId = randomUUID();
  const keptId = randomUUID();
  await storage.put({ documentId: removedId, bytes: new Uint8Array([1]) });
  await storage.putThumbnail({ documentId: removedId, bytes: new Uint8Array([2]) });
  await storage.putThumbnail({ documentId: keptId, bytes: new Uint8Array([3]) });
  await storage.remove(removedId);
  await expect(storage.readThumbnail(removedId)).rejects.toThrow();
  expect(await storage.readThumbnail(keptId)).toEqual(new Uint8Array([3]));
});
