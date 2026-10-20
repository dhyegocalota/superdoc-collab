import { BOOTSTRAP_STATE_BYTES_RATIO, isHeavyRoomDocument } from '@superdoc-collab/types';
import { SUPERDOC_ROOM_PREFIX } from './room-name';
import type { RoomMemoryRelease } from './room-memory-release';

export type HeavyRoomAdmission = {
  admits: (documentId: string) => boolean;
  hasHeadroomFor: (parameters: { documentXmlBytes: number }) => boolean;
};

export function createHeavyRoomAdmission({
  roomMemory,
  documentXmlBytesOf,
  isInFlight,
}: {
  roomMemory: RoomMemoryRelease;
  documentXmlBytesOf: (documentId: string) => number;
  isInFlight: (documentId: string) => boolean;
}): HeavyRoomAdmission {
  return {
    admits(documentId) {
      if (isInFlight(documentId)) return true;
      if (!roomMemory.isBounded()) return true;
      const documentXmlBytes = documentXmlBytesOf(documentId);
      if (!isHeavyRoomDocument(documentXmlBytes)) return true;
      return roomMemory.admit({
        documentName: `${SUPERDOC_ROOM_PREFIX}${documentId}`,
        estimatedStateBytes: documentXmlBytes * BOOTSTRAP_STATE_BYTES_RATIO,
      });
    },
    hasHeadroomFor({ documentXmlBytes }) {
      if (!isHeavyRoomDocument(documentXmlBytes)) return true;
      return roomMemory.hasHeadroomFor(documentXmlBytes * BOOTSTRAP_STATE_BYTES_RATIO);
    },
  };
}
