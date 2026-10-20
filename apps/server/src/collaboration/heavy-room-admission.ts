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
      throw new Error(`isRefused is not implemented ${documentId} ${typeof roomMemory} ${typeof documentXmlBytesOf}`);
    },
  };
}
