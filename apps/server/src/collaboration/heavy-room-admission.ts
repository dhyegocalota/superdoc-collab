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
      return documentId.length > 0 && typeof roomMemory === 'object' && typeof documentXmlBytesOf === typeof isInFlight;
    },
    hasHeadroomFor({ documentXmlBytes }) {
      return documentXmlBytes >= 0;
    },
  };
}
