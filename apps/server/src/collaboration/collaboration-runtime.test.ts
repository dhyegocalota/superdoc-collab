import type { Hocuspocus } from '@hocuspocus/server';
import {
  ACCESS_REVOKED_CLOSE_CODE,
  ACCESS_REVOKED_REASON,
  CREATOR_RESERVATION_MAX_MS,
  CREATOR_RESERVATION_MS,
  SUPERSEDED_ATTEMPT_CLOSE_CODE,
  SUPERSEDED_ATTEMPT_REASON,
} from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { createCollaborationRuntime } from './collaboration-runtime';
import { CreatorReservations } from './creator-reservations';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const FIRST_EDITOR = 'editor-1';
const SECOND_EDITOR = 'editor-2';

type FakeConnection = { context: { creatorAttempt: number | null; userId?: string }; close: ReturnType<typeof vi.fn> };

function connectionWithAttempt(creatorAttempt: number | null): FakeConnection {
  return { context: { creatorAttempt }, close: vi.fn() };
}

function connectionOfUser(userId: string): FakeConnection {
  return { context: { creatorAttempt: null, userId }, close: vi.fn() };
}

function runtimeWith({
  rooms,
  reservations,
  versionRooms = { closeUser: vi.fn() },
}: {
  rooms: Record<string, FakeConnection[]>;
  reservations: CreatorReservations;
  versionRooms?: { closeUser: ReturnType<typeof vi.fn> };
}) {
  const documents = new Map(
    Object.entries(rooms).map(([documentId, connections]) => [
      `${SUPERDOC_ROOM_PREFIX}${documentId}`,
      {
        name: `${SUPERDOC_ROOM_PREFIX}${documentId}`,
        connections: new Map(connections.map((connection, index) => [index, { connection }])),
      },
    ]),
  );
  return createCollaborationRuntime({
    hocuspocus: { documents } as unknown as Hocuspocus,
    reservations,
    versionRooms,
  } as unknown as Parameters<typeof createCollaborationRuntime>[0]);
}

test("a takeover closes the superseded creator's socket with 4403 and the reason", () => {
  const clock = { time: 0 };
  const reservations = new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now: () => clock.time });
  const superseded = connectionWithAttempt(1);
  const otherRoom = connectionWithAttempt(1);
  const runtime = runtimeWith({ rooms: { [DOCUMENT_ID]: [superseded], [OTHER_DOCUMENT_ID]: [otherRoom] }, reservations });
  expect(runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR })).toEqual({ attempt: 1, epoch: reservations.epoch });
  expect(superseded.close).not.toHaveBeenCalled();
  clock.time += CREATOR_RESERVATION_MAX_MS + 1;
  expect(runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR })).toEqual({ attempt: 2, epoch: reservations.epoch });
  expect(superseded.close).toHaveBeenCalledWith({ code: SUPERSEDED_ATTEMPT_CLOSE_CODE, reason: SUPERSEDED_ATTEMPT_REASON });
  expect(otherRoom.close).not.toHaveBeenCalled();
});

test('a takeover close is logged with the document id and the superseded attempt', () => {
  const clock = { time: 0 };
  const reservations = new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now: () => clock.time });
  const runtime = runtimeWith({ rooms: { [DOCUMENT_ID]: [connectionWithAttempt(1)] }, reservations });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
  expect(warn).not.toHaveBeenCalled();
  clock.time += CREATOR_RESERVATION_MAX_MS + 1;
  runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR });
  expect(warn).toHaveBeenCalledOnce();
  expect(warn.mock.calls.flat().join(' ')).toContain(DOCUMENT_ID);
  expect(warn.mock.calls.flat().join(' ')).toContain('attempt 1');
  warn.mockRestore();
});

test('a holder with a connected socket is not taken over when the silence timer has run out', () => {
  const clock = { time: 0 };
  const reservations = new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now: () => clock.time });
  const holder = connectionWithAttempt(1);
  const runtime = runtimeWith({ rooms: { [DOCUMENT_ID]: [holder] }, reservations });
  runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
  clock.time += CREATOR_RESERVATION_MS + 1;
  expect(runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR })).toBeNull();
  expect(holder.close).not.toHaveBeenCalled();
});

test('a takeover happens once the last socket is gone and the silence timer has run out', () => {
  const clock = { time: 0 };
  const reservations = new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now: () => clock.time });
  const runtime = runtimeWith({ rooms: { [DOCUMENT_ID]: [] }, reservations });
  runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
  clock.time += CREATOR_RESERVATION_MS + 1;
  expect(runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR })).toEqual({ attempt: 2, epoch: reservations.epoch });
});

test("closeUserConnections closes only that user's sockets of the document with 4404 and the reason", () => {
  const reservations = new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now: () => 0 });
  const removedFirstTab = connectionOfUser(FIRST_EDITOR);
  const removedSecondTab = connectionOfUser(FIRST_EDITOR);
  const stayingUser = connectionOfUser(SECOND_EDITOR);
  const removedUserInOtherDocument = connectionOfUser(FIRST_EDITOR);
  const runtime = runtimeWith({
    rooms: { [DOCUMENT_ID]: [removedFirstTab, stayingUser, removedSecondTab], [OTHER_DOCUMENT_ID]: [removedUserInOtherDocument] },
    reservations,
  });
  runtime.closeUserConnections({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
  expect(removedFirstTab.close).toHaveBeenCalledWith({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON });
  expect(removedSecondTab.close).toHaveBeenCalledWith({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON });
  expect(stayingUser.close).not.toHaveBeenCalled();
  expect(removedUserInOtherDocument.close).not.toHaveBeenCalled();
});

test('closeUserConnections also closes the version sockets of that user', () => {
  const reservations = new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now: () => 0 });
  const versionRooms = { closeUser: vi.fn() };
  const runtime = runtimeWith({ rooms: { [DOCUMENT_ID]: [] }, reservations, versionRooms });
  runtime.closeUserConnections({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
  expect(versionRooms.closeUser).toHaveBeenCalledWith({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
});
