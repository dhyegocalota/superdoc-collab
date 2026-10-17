import { expect, test } from 'vitest';
import { documentIdFromRoomName } from './room-name';

const DOCUMENT_ID = '0b5c2f9e-6a1d-4c3b-9e8f-1a2b3c4d5e6f';

test('reads the document id from the SuperDoc v2.1 room name and refuses any other shape', () => {
  expect(documentIdFromRoomName(`sd2/v2.1/${DOCUMENT_ID}`)).toBe(DOCUMENT_ID);
  const refused = [
    `other/${DOCUMENT_ID}`,
    `sd2/v2.1/${DOCUMENT_ID}/x`,
    DOCUMENT_ID,
    'sd2/v2.1/probe',
    `sd2/v2.1/${DOCUMENT_ID.toUpperCase()}`,
    `sd2/v2.1/${DOCUMENT_ID}\n`,
  ];
  expect(refused.map(documentIdFromRoomName)).toEqual(refused.map(() => null));
});
