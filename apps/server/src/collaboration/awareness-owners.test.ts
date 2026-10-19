import { MAX_AWARENESS_ENTRIES_PER_FRAME } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { AwarenessOwners, type AwarenessEntry } from './awareness-owners';

const DOCUMENT_NAME = 'superdoc-room-1';
const OTHER_DOCUMENT_NAME = 'superdoc-room-2';
const OWNER = 'user-owner';
const OTHER_USER = 'user-other';
const CLIENT_ID = 1_000_000;
const HELD_CLOCK = 5;
const PINNED_CLOCK = 2 ** 53;
const META = new Map([[CLIENT_ID, { clock: HELD_CLOCK }]]);

function boundOwners(): AwarenessOwners {
  const owners = new AwarenessOwners();
  owners.bind({ documentName: DOCUMENT_NAME, clientIds: [CLIENT_ID], userId: OWNER });
  return owners;
}

function forbids({ owners, userId, entries }: { owners: AwarenessOwners; userId: string; entries: AwarenessEntry[] }): boolean {
  return owners.forbids({ documentName: DOCUMENT_NAME, userId, entries, meta: META });
}

test('an id nobody announced is not forbidden to anyone', () => {
  const entries = [{ clientId: CLIENT_ID, clock: HELD_CLOCK + 1 }];
  expect(forbids({ owners: new AwarenessOwners(), userId: OTHER_USER, entries })).toBe(false);
});

test('another user touching a bound id above the held clock is forbidden', () => {
  const entries = [{ clientId: CLIENT_ID, clock: HELD_CLOCK + 1 }];
  expect(forbids({ owners: boundOwners(), userId: OTHER_USER, entries })).toBe(true);
});

test('another user touching a bound id at a clock of 2 to the 53 is forbidden', () => {
  expect(forbids({ owners: boundOwners(), userId: OTHER_USER, entries: [{ clientId: CLIENT_ID, clock: PINNED_CLOCK }] })).toBe(true);
});

test('another user relaying a bound id at the held clock or below is not forbidden', () => {
  const entries = [HELD_CLOCK, HELD_CLOCK - 1].map((clock) => ({ clientId: CLIENT_ID, clock }));
  expect(entries.map((entry) => forbids({ owners: boundOwners(), userId: OTHER_USER, entries: [entry] }))).toEqual([false, false]);
});

test('the owner touching its own id at any clock is not forbidden', () => {
  const entries = [{ clientId: CLIENT_ID, clock: PINNED_CLOCK }];
  expect(forbids({ owners: boundOwners(), userId: OWNER, entries })).toBe(false);
});

test('a bound id without a held clock is forbidden to another user', () => {
  const owners = boundOwners();
  const entries = [{ clientId: CLIENT_ID, clock: 1 }];
  expect(owners.forbids({ documentName: DOCUMENT_NAME, userId: OTHER_USER, entries, meta: new Map() })).toBe(true);
});

test('a binding belongs to its document and is forgotten with it', () => {
  const owners = boundOwners();
  const entries = [{ clientId: CLIENT_ID, clock: HELD_CLOCK + 1 }];
  expect(owners.forbids({ documentName: OTHER_DOCUMENT_NAME, userId: OTHER_USER, entries, meta: META })).toBe(false);
  owners.forget(DOCUMENT_NAME);
  expect(forbids({ owners, userId: OTHER_USER, entries })).toBe(false);
});

test('a binding already made is not taken over by a later announcement', () => {
  const owners = boundOwners();
  owners.bind({ documentName: DOCUMENT_NAME, clientIds: [CLIENT_ID], userId: OTHER_USER });
  const entries = [{ clientId: CLIENT_ID, clock: HELD_CLOCK + 1 }];
  expect([OWNER, OTHER_USER].map((userId) => forbids({ owners, userId, entries }))).toEqual([false, true]);
});

test('an honest relay of the full frame cap of bound ids at their held clocks is not forbidden', () => {
  const owners = new AwarenessOwners();
  const clientIds = Array.from({ length: MAX_AWARENESS_ENTRIES_PER_FRAME }, (_, index) => CLIENT_ID + index);
  owners.bind({ documentName: DOCUMENT_NAME, clientIds, userId: OWNER });
  const meta = new Map(clientIds.map((clientId) => [clientId, { clock: HELD_CLOCK }]));
  const entries = clientIds.map((clientId) => ({ clientId, clock: HELD_CLOCK }));
  expect(owners.forbids({ documentName: DOCUMENT_NAME, userId: OTHER_USER, entries, meta })).toBe(false);
});
