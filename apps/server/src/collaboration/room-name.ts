export const SUPERDOC_ROOM_PREFIX = 'sd2/v2.1/';
const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function documentIdFromRoomName(roomName: string): string | null {
  if (!roomName.startsWith(SUPERDOC_ROOM_PREFIX)) return null;
  const documentId = roomName.slice(SUPERDOC_ROOM_PREFIX.length);
  if (!DOCUMENT_ID_PATTERN.test(documentId)) return null;
  return documentId;
}
