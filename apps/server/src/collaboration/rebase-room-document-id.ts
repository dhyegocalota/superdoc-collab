import * as Y from 'yjs';

const META_MAP = 'meta';
const ROOM_DOCUMENT_ID_KEY = 'roomDocumentId';
const BYTE_ENCODING = 'latin1';

export class RoomDocumentIdMissingError extends Error {
  constructor() {
    super('The state names no room document id to rebase.');
  }
}

export class RoomDocumentIdLengthError extends Error {
  constructor() {
    super('The room document ids differ in length, so the encoded state cannot be rebased.');
  }
}

export function rebaseRoomDocumentId({ state, documentId }: { state: Uint8Array; documentId: string }): Uint8Array {
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  const sourceId = document.getMap(META_MAP).get(ROOM_DOCUMENT_ID_KEY);
  if (typeof sourceId !== 'string') throw new RoomDocumentIdMissingError();
  if (sourceId.length !== documentId.length) throw new RoomDocumentIdLengthError();
  const rebased = Buffer.from(state).toString(BYTE_ENCODING).replaceAll(sourceId, documentId);
  return new Uint8Array(Buffer.from(rebased, BYTE_ENCODING));
}
