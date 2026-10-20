import { LARGE_ROOM_STATE_BYTES, BOOTSTRAP_STATE_BYTES_RATIO } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { createHeavyRoomAdmission } from './heavy-room-admission';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const HEAVY_XML_BYTES = LARGE_ROOM_STATE_BYTES / BOOTSTRAP_STATE_BYTES_RATIO + 1;
const LIGHT_XML_BYTES = LARGE_ROOM_STATE_BYTES / BOOTSTRAP_STATE_BYTES_RATIO;

function admissionWith({ isAtCeiling, documentXmlBytes }: { isAtCeiling: boolean; documentXmlBytes: number }) {
  const roomMemory = { grew: vi.fn(), unloaded: vi.fn(), heavyRoomCount: vi.fn(), isAtCeiling: vi.fn(() => isAtCeiling) };
  const documentXmlBytesOf = vi.fn(() => documentXmlBytes);
  return { roomMemory, documentXmlBytesOf, admission: createHeavyRoomAdmission({ roomMemory, documentXmlBytesOf }) };
}

test('a heavy document is refused while the ceiling is reached for its room', () => {
  const { admission, roomMemory } = admissionWith({ isAtCeiling: true, documentXmlBytes: HEAVY_XML_BYTES });
  expect(admission.isRefused(DOCUMENT_ID)).toBe(true);
  expect(roomMemory.isAtCeiling).toHaveBeenCalledWith(`${SUPERDOC_ROOM_PREFIX}${DOCUMENT_ID}`);
});

test('a light document is never refused, whatever the ceiling', () => {
  const { admission } = admissionWith({ isAtCeiling: true, documentXmlBytes: LIGHT_XML_BYTES });
  expect(admission.isRefused(DOCUMENT_ID)).toBe(false);
});

test('below the ceiling nothing is refused and the stored file is not even read', () => {
  const { admission, documentXmlBytesOf } = admissionWith({ isAtCeiling: false, documentXmlBytes: HEAVY_XML_BYTES });
  expect(admission.isRefused(DOCUMENT_ID)).toBe(false);
  expect(documentXmlBytesOf).not.toHaveBeenCalled();
});
