import { DOCX_EXTENSION } from '@superdoc-collab/types';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidDocumentIdError, type DocumentFileStorage } from './file-storage';

const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const THUMBNAILS_DIRECTORY = 'thumbnails';
const THUMBNAIL_EXTENSION = '.thumbnail';

export function createLocalDiskFileStorage(directory: string): DocumentFileStorage {
  const thumbnailsDirectory = join(directory, THUMBNAILS_DIRECTORY);
  function validDocumentId(documentId: string): string {
    if (!DOCUMENT_ID_PATTERN.test(documentId)) throw new InvalidDocumentIdError();
    return documentId;
  }
  function pathOf(documentId: string): string {
    return join(directory, `${validDocumentId(documentId)}${DOCX_EXTENSION}`);
  }
  function thumbnailPathOf(documentId: string): string {
    return join(thumbnailsDirectory, `${validDocumentId(documentId)}${THUMBNAIL_EXTENSION}`);
  }
  return {
    pathOf,
    async put({ documentId, bytes }) {
      await mkdir(directory, { recursive: true });
      await writeFile(pathOf(documentId), bytes);
    },
    async putThumbnail({ documentId, bytes }) {
      await mkdir(thumbnailsDirectory, { recursive: true });
      await writeFile(thumbnailPathOf(documentId), bytes);
    },
    read: async (documentId) => new Uint8Array(await readFile(pathOf(documentId))),
    readThumbnail: async (documentId) => new Uint8Array(await readFile(thumbnailPathOf(documentId))),
    async remove(documentId) {
      await rm(pathOf(documentId), { force: true });
      await rm(thumbnailPathOf(documentId), { force: true });
    },
  };
}
