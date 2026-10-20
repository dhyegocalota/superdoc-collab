import { BOOTSTRAP_STATE_BYTES_RATIO, isHeavyRoomDocument } from '@superdoc-collab/types';
import { SUPERDOC_ROOM_PREFIX } from './room-name';
import type { RoomMemoryRelease } from './room-memory-release';

type Seat = { documentId: string; userId: string };
type HeavyPlace = { documentName: string; estimatedStateBytes: number; userId: string };

export type HeavyRoomAdmission = {
  admits: (seat: Seat) => boolean;
  fits: (seat: Seat) => boolean;
  reserveForUpload: (seat: Seat) => void;
  releaseUpload: (documentId: string) => void;
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
  function heavyPlaceOf({ documentId, userId }: Seat): HeavyPlace | null {
    if (!roomMemory.isBounded()) return null;
    const documentXmlBytes = documentXmlBytesOf(documentId);
    if (!isHeavyRoomDocument(documentXmlBytes)) return null;
    return {
      documentName: `${SUPERDOC_ROOM_PREFIX}${documentId}`,
      estimatedStateBytes: documentXmlBytes * BOOTSTRAP_STATE_BYTES_RATIO,
      userId,
    };
  }

  return {
    admits(seat) {
      if (isInFlight(seat.documentId)) return true;
      const place = heavyPlaceOf(seat);
      if (place === null) return true;
      return roomMemory.admit(place);
    },
    fits(seat) {
      if (isInFlight(seat.documentId)) return true;
      const place = heavyPlaceOf(seat);
      if (place === null) return true;
      return roomMemory.fits(place);
    },
    reserveForUpload(seat) {
      const place = heavyPlaceOf(seat);
      if (place === null) return;
      roomMemory.reserveForUpload(place);
    },
    releaseUpload(documentId) {
      roomMemory.unreserved(`${SUPERDOC_ROOM_PREFIX}${documentId}`);
    },
    hasHeadroomFor({ documentXmlBytes }) {
      if (!isHeavyRoomDocument(documentXmlBytes)) return true;
      return roomMemory.hasHeadroomFor(documentXmlBytes * BOOTSTRAP_STATE_BYTES_RATIO);
    },
  };
}
