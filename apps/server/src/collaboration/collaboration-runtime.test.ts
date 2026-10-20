import type { Hocuspocus } from '@hocuspocus/server';
import { ACCESS_REVOKED_CLOSE_CODE, ACCESS_REVOKED_REASON, BootstrapStage, RoomMode, type BootstrapProgress } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { createCollaborationRuntime } from './collaboration-runtime';
import { COMMITTED_WITHOUT_BOOTSTRAP } from './room-bootstrap';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const FIRST_EDITOR = 'editor-1';
const SECOND_EDITOR = 'editor-2';

type FakeConnection = { context: { userId: string }; close: ReturnType<typeof vi.fn> };

function connectionOfUser(userId: string): FakeConnection {
  return { context: { userId }, close: vi.fn() };
}

const QUEUED: BootstrapProgress = {
  stage: BootstrapStage.Queued,
  done: 0,
  total: 9,
  stateBytes: null,
  estimatedMs: null,
  documentXmlBytes: 0,
  preparingElapsedMs: null,
};

function fakeRoomBootstrap({ progress = null, isInFlight = false }: { progress?: BootstrapProgress | null; isInFlight?: boolean } = {}) {
  return { progressOf: vi.fn(() => progress), request: vi.fn(() => QUEUED), forget: vi.fn(), isInFlight: vi.fn(() => isInFlight) };
}

function runtimeWith({
  rooms,
  roomBootstrap = fakeRoomBootstrap(),
  bootstrap = { isKnownCommitted: vi.fn(() => false) },
  versionRooms = { closeUser: vi.fn(), closeAllOfUser: vi.fn() },
  roomModes = { resolve: vi.fn() },
}: {
  rooms: Record<string, FakeConnection[]>;
  roomBootstrap?: ReturnType<typeof fakeRoomBootstrap>;
  bootstrap?: { isKnownCommitted: ReturnType<typeof vi.fn> };
  versionRooms?: { closeUser: ReturnType<typeof vi.fn>; closeAllOfUser: ReturnType<typeof vi.fn> };
  roomModes?: { resolve: ReturnType<typeof vi.fn> };
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
    roomBootstrap,
    bootstrap,
    versionRooms,
    roomModes,
  } as unknown as Parameters<typeof createCollaborationRuntime>[0]);
}

test("closeUserConnections closes only that user's sockets of the document with 4404 and the reason", () => {
  const removedFirstTab = connectionOfUser(FIRST_EDITOR);
  const removedSecondTab = connectionOfUser(FIRST_EDITOR);
  const stayingUser = connectionOfUser(SECOND_EDITOR);
  const removedUserInOtherDocument = connectionOfUser(FIRST_EDITOR);
  const runtime = runtimeWith({
    rooms: { [DOCUMENT_ID]: [removedFirstTab, stayingUser, removedSecondTab], [OTHER_DOCUMENT_ID]: [removedUserInOtherDocument] },
  });
  runtime.closeUserConnections({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
  expect(removedFirstTab.close).toHaveBeenCalledWith({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON });
  expect(removedSecondTab.close).toHaveBeenCalledWith({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON });
  expect(stayingUser.close).not.toHaveBeenCalled();
  expect(removedUserInOtherDocument.close).not.toHaveBeenCalled();
});

test("closeConnectionsOfUser closes that user's sockets in every document and leaves other users alone", () => {
  const firstDocumentSocket = connectionOfUser(FIRST_EDITOR);
  const secondDocumentSocket = connectionOfUser(FIRST_EDITOR);
  const stayingUser = connectionOfUser(SECOND_EDITOR);
  const runtime = runtimeWith({
    rooms: { [DOCUMENT_ID]: [firstDocumentSocket, stayingUser], [OTHER_DOCUMENT_ID]: [secondDocumentSocket] },
  });
  runtime.closeConnectionsOfUser(FIRST_EDITOR);
  expect(firstDocumentSocket.close).toHaveBeenCalledWith({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON });
  expect(secondDocumentSocket.close).toHaveBeenCalledWith({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON });
  expect(stayingUser.close).not.toHaveBeenCalled();
});

test('closeUserConnections also closes the version sockets of that user', () => {
  const versionRooms = { closeUser: vi.fn(), closeAllOfUser: vi.fn() };
  const runtime = runtimeWith({ rooms: { [DOCUMENT_ID]: [] }, versionRooms });
  runtime.closeUserConnections({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
  expect(versionRooms.closeUser).toHaveBeenCalledWith({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
});

test('closeConnectionsOfUser also closes the version sockets of that user in every document', () => {
  const versionRooms = { closeUser: vi.fn(), closeAllOfUser: vi.fn() };
  const runtime = runtimeWith({ rooms: { [DOCUMENT_ID]: [] }, versionRooms });
  runtime.closeConnectionsOfUser(FIRST_EDITOR);
  expect(versionRooms.closeAllOfUser).toHaveBeenCalledWith(FIRST_EDITOR);
});

test('the bootstrap of a document with a job is the progress of that job', () => {
  const progress: BootstrapProgress = {
    stage: BootstrapStage.Preparing,
    done: 0,
    total: 9,
    stateBytes: null,
    estimatedMs: null,
    documentXmlBytes: 0,
    preparingElapsedMs: null,
  };
  const roomBootstrap = fakeRoomBootstrap({ progress });
  const runtime = runtimeWith({ rooms: {}, roomBootstrap });
  expect(runtime.bootstrapRoom(DOCUMENT_ID)).toBe(progress);
  expect(roomBootstrap.request).not.toHaveBeenCalled();
});

test('a document committed without a job is ready with nothing to process and starts no job', () => {
  const roomBootstrap = fakeRoomBootstrap();
  const runtime = runtimeWith({ rooms: {}, roomBootstrap, bootstrap: { isKnownCommitted: vi.fn(() => true) } });
  expect(runtime.bootstrapRoom(DOCUMENT_ID)).toBe(COMMITTED_WITHOUT_BOOTSTRAP);
  expect(roomBootstrap.request).not.toHaveBeenCalled();
});

test('an uncommitted document with no job is requested once and answers the queued progress', () => {
  const roomBootstrap = fakeRoomBootstrap();
  const runtime = runtimeWith({ rooms: {}, roomBootstrap });
  expect(runtime.bootstrapRoom(DOCUMENT_ID)).toBe(QUEUED);
  expect(roomBootstrap.request).toHaveBeenCalledExactlyOnceWith(DOCUMENT_ID);
});

test('a failed job is requested again so the registry may retry it after its cooldown', () => {
  const failed: BootstrapProgress = {
    stage: BootstrapStage.Failed,
    done: 0,
    total: 9,
    stateBytes: null,
    estimatedMs: null,
    documentXmlBytes: 0,
    preparingElapsedMs: null,
  };
  const roomBootstrap = fakeRoomBootstrap({ progress: failed });
  const runtime = runtimeWith({ rooms: {}, roomBootstrap });
  expect(runtime.bootstrapRoom(DOCUMENT_ID)).toBe(QUEUED);
  expect(roomBootstrap.request).toHaveBeenCalledExactlyOnceWith(DOCUMENT_ID);
});

test('opening a document whose bootstrap is in flight answers Join from the registry and never resolves the room mode', () => {
  const roomModes = { resolve: vi.fn() };
  const runtime = runtimeWith({ rooms: {}, roomBootstrap: fakeRoomBootstrap({ isInFlight: true }), roomModes });
  expect(runtime.roomModeFor({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR })).toEqual({ isSpent: false, roomMode: RoomMode.Join });
  expect(roomModes.resolve).not.toHaveBeenCalled();
});

test('opening a document with no bootstrap in flight resolves the room mode', () => {
  const answer = { isSpent: false, roomMode: RoomMode.Create };
  const roomModes = { resolve: vi.fn(() => answer) };
  const runtime = runtimeWith({ rooms: {}, roomModes });
  expect(runtime.roomModeFor({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR })).toBe(answer);
  expect(roomModes.resolve).toHaveBeenCalledExactlyOnceWith({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
});

test('forgetting a document forgets its bootstrap', async () => {
  const roomBootstrap = fakeRoomBootstrap();
  const runtime = createCollaborationRuntime({
    hocuspocus: { documents: new Map(), closeConnections: vi.fn() },
    updateLog: { forget: vi.fn() },
    bootstrap: { forget: vi.fn() },
    roomBootstrap,
    timelinePipelines: { forget: vi.fn() },
    versions: { forget: vi.fn() },
    versionRooms: { forget: vi.fn() },
    scheduler: { forget: vi.fn() },
    insights: { selection: { forget: vi.fn() } },
  } as unknown as Parameters<typeof createCollaborationRuntime>[0]);
  await runtime.forget(DOCUMENT_ID);
  expect(roomBootstrap.forget).toHaveBeenCalledExactlyOnceWith(DOCUMENT_ID);
});
