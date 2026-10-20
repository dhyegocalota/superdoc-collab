import { isHeavyRoomDocument } from '@superdoc-collab/types';
import { SUPERDOC_ROOM_PREFIX } from './room-name';
import type { RoomMemoryRelease } from './room-memory-release';

export type HeavyRoomAdmission = { isRefused: (documentId: string) => boolean };

export function createHeavyRoomAdmission({
  roomMemory,
  documentXmlBytesOf,
}: {
  roomMemory: RoomMemoryRelease;
  documentXmlBytesOf: (documentId: string) => number;
}): HeavyRoomAdmission {
  return {
    isRefused(documentId) {
      if (!roomMemory.isAtCeiling(`${SUPERDOC_ROOM_PREFIX}${documentId}`)) return false;
      return isHeavyRoomDocument(documentXmlBytesOf(documentId));
    },
  };
}
