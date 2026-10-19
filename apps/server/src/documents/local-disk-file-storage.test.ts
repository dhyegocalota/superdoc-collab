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
