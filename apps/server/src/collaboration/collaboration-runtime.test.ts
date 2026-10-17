import type { Hocuspocus } from '@hocuspocus/server';
import { CREATOR_RESERVATION_MS, SUPERSEDED_ATTEMPT_CLOSE_CODE, SUPERSEDED_ATTEMPT_REASON } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { createCollaborationRuntime } from './collaboration-runtime';
import { CreatorReservations } from './creator-reservations';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const FIRST_EDITOR = 'editor-1';
const SECOND_EDITOR = 'editor-2';

type FakeConnection = { context: { creatorAttempt: number | null }; close: ReturnType<typeof vi.fn> };

function connectionWithAttempt(creatorAttempt: number | null): FakeConnection {
  return { context: { creatorAttempt }, close: vi.fn() };
}

function runtimeWith({ rooms, reservations }: { rooms: Record<string, FakeConnection[]>; reservations: CreatorReservations }) {
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
  } as unknown as Parameters<typeof createCollaborationRuntime>[0]);
}

test("a takeover closes the superseded creator's socket with 4403 and the reason", () => {
  const clock = { time: 0 };
  const reservations = new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now: () => clock.time });
  const superseded = connectionWithAttempt(1);
  const otherRoom = connectionWithAttempt(1);
  const runtime = runtimeWith({ rooms: { [DOCUMENT_ID]: [superseded], [OTHER_DOCUMENT_ID]: [otherRoom] }, reservations });
  expect(runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR })).toBe(1);
  expect(superseded.close).not.toHaveBeenCalled();
  clock.time += CREATOR_RESERVATION_MS + 1;
  expect(runtime.reserveCreator({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR })).toBe(2);
  expect(superseded.close).toHaveBeenCalledWith({ code: SUPERSEDED_ATTEMPT_CLOSE_CODE, reason: SUPERSEDED_ATTEMPT_REASON });
  expect(otherRoom.close).not.toHaveBeenCalled();
});
