import { BOOTSTRAP_STATE_BYTES_RATIO, LARGE_ROOM_STATE_BYTES } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { createHeavyRoomAdmission } from './heavy-room-admission';
import { ROOM_UPLOAD_RESERVATION_TTL_MS } from './room-memory-release';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const USER_ID = 'user-ana';
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const HEAVY_XML_BYTES = LARGE_ROOM_STATE_BYTES / BOOTSTRAP_STATE_BYTES_RATIO + 1;
const LIGHT_XML_BYTES = LARGE_ROOM_STATE_BYTES / BOOTSTRAP_STATE_BYTES_RATIO;

function admissionWith({
  isAdmitted = true,
  hasHeadroom = true,
  isBounded = true,
  documentXmlBytes,
  isInFlight = false,
}: {
  isAdmitted?: boolean;
  hasHeadroom?: boolean;
  isBounded?: boolean;
  documentXmlBytes: number;
  isInFlight?: boolean;
}) {
  const roomMemory = {
    grew: vi.fn(),
    unloaded: vi.fn(),
    roomsHeapBytes: vi.fn(),
    loaded: vi.fn(),
    isBounded: vi.fn(() => isBounded),
    admit: vi.fn(() => isAdmitted),
    fits: vi.fn(() => isAdmitted),
    released: vi.fn(),
    hasHeadroomFor: vi.fn(() => hasHeadroom),
  };
  const documentXmlBytesOf = vi.fn(() => documentXmlBytes);
  return {
    roomMemory,
    documentXmlBytesOf,
    admission: createHeavyRoomAdmission({ roomMemory, documentXmlBytesOf, isInFlight: () => isInFlight }),
  };
}

test('a heavy document is asked of the room memory with the state its XML would make, under its room name', () => {
  const { admission, roomMemory } = admissionWith({ isAdmitted: false, documentXmlBytes: HEAVY_XML_BYTES });
  expect(admission.admits({ documentId: DOCUMENT_ID, userId: USER_ID })).toBe(false);
  expect(roomMemory.admit).toHaveBeenCalledWith({
    documentName: `${SUPERDOC_ROOM_PREFIX}${DOCUMENT_ID}`,
    estimatedStateBytes: HEAVY_XML_BYTES * BOOTSTRAP_STATE_BYTES_RATIO,
    userId: USER_ID,
  });
});

test('a light document is admitted without taking a place', () => {
  const { admission, roomMemory } = admissionWith({ isAdmitted: false, documentXmlBytes: LIGHT_XML_BYTES });
  expect(admission.admits({ documentId: DOCUMENT_ID, userId: USER_ID })).toBe(true);
  expect(roomMemory.admit).not.toHaveBeenCalled();
});

test('without a budget nothing is asked and the stored file is not even read', () => {
  const { admission, documentXmlBytesOf, roomMemory } = admissionWith({ isBounded: false, documentXmlBytes: HEAVY_XML_BYTES });
  expect(admission.admits({ documentId: DOCUMENT_ID, userId: USER_ID })).toBe(true);
  expect(documentXmlBytesOf).not.toHaveBeenCalled();
  expect(roomMemory.admit).not.toHaveBeenCalled();
});

test('a document still being prepared is never refused, so the queue shows where it stands', () => {
  const { admission, roomMemory } = admissionWith({ isAdmitted: false, documentXmlBytes: HEAVY_XML_BYTES, isInFlight: true });
  expect(admission.admits({ documentId: DOCUMENT_ID, userId: USER_ID })).toBe(true);
  expect(roomMemory.admit).not.toHaveBeenCalled();
});

test('headroom for an upload is asked only for a heavy file, with the state its XML would make', () => {
  const heavy = admissionWith({ hasHeadroom: false, documentXmlBytes: 0 });
  expect(heavy.admission.hasHeadroomFor({ documentXmlBytes: HEAVY_XML_BYTES })).toBe(false);
  expect(heavy.roomMemory.hasHeadroomFor).toHaveBeenCalledWith(HEAVY_XML_BYTES * BOOTSTRAP_STATE_BYTES_RATIO);
  const light = admissionWith({ hasHeadroom: false, documentXmlBytes: 0 });
  expect(light.admission.hasHeadroomFor({ documentXmlBytes: LIGHT_XML_BYTES })).toBe(true);
  expect(light.roomMemory.hasHeadroomFor).not.toHaveBeenCalled();
});

test('fitting looks without taking a place: a heavy document is asked with fits, never admit, and a light or prepared one always fits', () => {
  const heavy = admissionWith({ isAdmitted: false, documentXmlBytes: HEAVY_XML_BYTES });
  expect(heavy.admission.fits({ documentId: DOCUMENT_ID, userId: USER_ID })).toBe(false);
  expect(heavy.roomMemory.fits).toHaveBeenCalledWith({
    documentName: `${SUPERDOC_ROOM_PREFIX}${DOCUMENT_ID}`,
    estimatedStateBytes: HEAVY_XML_BYTES * BOOTSTRAP_STATE_BYTES_RATIO,
    userId: USER_ID,
  });
  expect(heavy.roomMemory.admit).not.toHaveBeenCalled();
  const light = admissionWith({ isAdmitted: false, documentXmlBytes: LIGHT_XML_BYTES });
  expect(light.admission.fits({ documentId: DOCUMENT_ID, userId: USER_ID })).toBe(true);
  const prepared = admissionWith({ isAdmitted: false, documentXmlBytes: HEAVY_XML_BYTES, isInFlight: true });
  expect(prepared.admission.fits({ documentId: DOCUMENT_ID, userId: USER_ID })).toBe(true);
  const unbounded = admissionWith({ isAdmitted: false, isBounded: false, documentXmlBytes: HEAVY_XML_BYTES });
  expect(unbounded.admission.fits({ documentId: DOCUMENT_ID, userId: USER_ID })).toBe(true);
});

test('an upload reserves the place its room will need for as long as a bootstrap may take, only for a heavy document', () => {
  const heavy = admissionWith({ documentXmlBytes: HEAVY_XML_BYTES });
  heavy.admission.reserveForUpload({ documentId: DOCUMENT_ID, userId: USER_ID });
  expect(heavy.roomMemory.admit).toHaveBeenCalledExactlyOnceWith({
    documentName: `${SUPERDOC_ROOM_PREFIX}${DOCUMENT_ID}`,
    estimatedStateBytes: HEAVY_XML_BYTES * BOOTSTRAP_STATE_BYTES_RATIO,
    userId: USER_ID,
    ttlMs: ROOM_UPLOAD_RESERVATION_TTL_MS,
  });
  const light = admissionWith({ documentXmlBytes: LIGHT_XML_BYTES });
  light.admission.reserveForUpload({ documentId: DOCUMENT_ID, userId: USER_ID });
  const unbounded = admissionWith({ isBounded: false, documentXmlBytes: HEAVY_XML_BYTES });
  unbounded.admission.reserveForUpload({ documentId: DOCUMENT_ID, userId: USER_ID });
  expect([light.roomMemory.admit, unbounded.roomMemory.admit].map((admit) => admit.mock.calls.length)).toEqual([0, 0]);
});
