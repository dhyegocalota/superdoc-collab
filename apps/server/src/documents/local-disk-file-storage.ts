import { DOCX_EXTENSION } from '@superdoc-collab/types';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidDocumentIdError, type DocumentFileStorage } from './file-storage';

const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createLocalDiskFileStorage(directory: string): DocumentFileStorage {
  function pathOf(documentId: string): string {
    if (!DOCUMENT_ID_PATTERN.test(documentId)) throw new InvalidDocumentIdError();
    return join(directory, `${documentId}${DOCX_EXTENSION}`);
  }
  return {
    pathOf,
    async put({ documentId, bytes }) {
      await mkdir(directory, { recursive: true });
      await writeFile(pathOf(documentId), bytes);
    },
    read: async (documentId) => new Uint8Array(await readFile(pathOf(documentId))),
    remove: (documentId) => rm(pathOf(documentId), { force: true }),
  };
}
