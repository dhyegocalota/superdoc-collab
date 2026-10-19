import {
  BOOTSTRAP_COMMIT_GRACE_MS,
  BOOTSTRAP_RETRY_COOLDOWN_MS,
  BOOTSTRAP_STATE_BYTES_RATIO,
  BootstrapStage,
} from '@superdoc-collab/types';
import { afterEach, expect, test, vi } from 'vitest';
import { BOOTSTRAP_FAILED_MESSAGE, BootstrapInterruptedError } from '../history/projection-messages';
import { RoomBootstrap } from './room-bootstrap';

const DOCUMENT_ID = 'document-plan';
const OTHER_DOCUMENT_ID = 'document-budget';
const OWNER_ID = 'user-ana';
const FILE_BYTES = 9_500_000;
const STATE_BYTES = 36_600_000;
const ESTIMATED_BYTES = FILE_BYTES * BOOTSTRAP_STATE_BYTES_RATIO;
const FRAME_BYTES = 1000;
const URL = 'ws://127.0.0.1:4000/collaboration/bootstrap';

type Run = { documentId: string; filePath: string; url: string; token: string };
type Pending = { request: Run; resolve: () => void; reject: (error: Error) => void };

afterEach(() => {
  vi.useRealTimers();
});

function bootstrapWithPendingRuns({
  ownerOf = () => OWNER_ID,
  now = () => Date.now(),
}: { ownerOf?: (documentId: string) => string | null; now?: () => number } = {}) {
  const pending: Pending[] = [];
  const issueToken = vi.fn(({ attempt }: { userId: string; documentId: string; attempt: string }) => `token-${attempt}`);
  const bootstrap = new RoomBootstrap({
    run: (request) => new Promise<void>((resolve, reject) => pending.push({ request, resolve, reject })),
    issueToken,
    collaborationUrl: () => URL,
    ownerOf,
    fileBytesOf: () => FILE_BYTES,
    filePathOf: (documentId) => `/files/${documentId}.docx`,
    now,
  });
  return { bootstrap, pending, issueToken };
}

test('a requested bootstrap is queued with the size of the upload and then prepared', async () => {
  const { bootstrap, pending, issueToken } = bootstrapWithPendingRuns();
  expect(bootstrap.request(DOCUMENT_ID)).toEqual({ stage: BootstrapStage.Queued, done: 0, total: ESTIMATED_BYTES, stateBytes: null });
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.progressOf(DOCUMENT_ID)).toEqual({ stage: BootstrapStage.Preparing, done: 0, total: ESTIMATED_BYTES, stateBytes: null });
  const [{ userId, documentId, attempt }] = issueToken.mock.calls[0]!;
  expect({ userId, documentId }).toEqual({ userId: OWNER_ID, documentId: DOCUMENT_ID });
  expect(pending[0]!.request).toEqual({
    documentId: DOCUMENT_ID,
    filePath: `/files/${DOCUMENT_ID}.docx`,
    url: URL,
    token: `token-${attempt}`,
  });
});

test('a document that was never requested has no progress', () => {
  expect(bootstrapWithPendingRuns().bootstrap.progressOf(DOCUMENT_ID)).toBeNull();
});

test('requesting again answers the progress it has and never runs twice', async () => {
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.request(DOCUMENT_ID).stage).toBe(BootstrapStage.Preparing);
  expect(pending).toHaveLength(1);
});

test('bootstraps run one at a time in the order they were requested', async () => {
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  bootstrap.request(OTHER_DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.progressOf(OTHER_DOCUMENT_ID)?.stage).toBe(BootstrapStage.Queued);
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  pending[0]!.resolve();
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(pending[1]!.request.documentId).toBe(OTHER_DOCUMENT_ID);
  expect(bootstrap.progressOf(OTHER_DOCUMENT_ID)?.stage).toBe(BootstrapStage.Preparing);
});

test('the commit makes the bootstrap ready with the whole upload done and the size of the state', async () => {
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  expect(bootstrap.progressOf(DOCUMENT_ID)).toEqual({
    stage: BootstrapStage.Ready,
    done: ESTIMATED_BYTES,
    total: ESTIMATED_BYTES,
    stateBytes: STATE_BYTES,
  });
  pending[0]!.resolve();
  await Promise.resolve();
  expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Ready);
});

test('a commit nobody asked for is ready with nothing to process', () => {
  const { bootstrap } = bootstrapWithPendingRuns();
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  expect(bootstrap.progressOf(DOCUMENT_ID)).toEqual({ stage: BootstrapStage.Ready, done: 0, total: 0, stateBytes: STATE_BYTES });
});

test('a failed run is reported once, stays failed within the cooldown and is not run again', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending[0]!.reject(new Error('not a document'));
  await vi.waitFor(() => expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Failed));
  expect(bootstrap.progressOf(DOCUMENT_ID)).toEqual({ stage: BootstrapStage.Failed, done: 0, total: ESTIMATED_BYTES, stateBytes: null });
  expect(error).toHaveBeenCalledExactlyOnceWith(`${BOOTSTRAP_FAILED_MESSAGE} ${DOCUMENT_ID}: Error: not a document`);
  expect(bootstrap.request(DOCUMENT_ID).stage).toBe(BootstrapStage.Failed);
  expect(pending).toHaveLength(1);
  error.mockRestore();
});

test('a run that ends without a commit is failed once the grace is over instead of left preparing', async () => {
  vi.useFakeTimers();
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.advanceTimersByTimeAsync(0);
  pending[0]!.resolve();
  await vi.advanceTimersByTimeAsync(BOOTSTRAP_COMMIT_GRACE_MS - 1);
  expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Preparing);
  await vi.advanceTimersByTimeAsync(1);
  expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Failed);
  error.mockRestore();
});

test('a commit that lands after the run resolved, within the grace, is ready and never failed', async () => {
  vi.useFakeTimers();
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.advanceTimersByTimeAsync(0);
  pending[0]!.resolve();
  await vi.advanceTimersByTimeAsync(BOOTSTRAP_COMMIT_GRACE_MS / 2);
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  await vi.advanceTimersByTimeAsync(BOOTSTRAP_COMMIT_GRACE_MS);
  expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Ready);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test('a failed bootstrap is run again by the first request after the cooldown, with a new attempt', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const clock = { time: 0 };
  const { bootstrap, pending, issueToken } = bootstrapWithPendingRuns({ now: () => clock.time });
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending[0]!.reject(new Error('not a document'));
  await vi.waitFor(() => expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Failed));
  clock.time = BOOTSTRAP_RETRY_COOLDOWN_MS - 1;
  expect(bootstrap.request(DOCUMENT_ID).stage).toBe(BootstrapStage.Failed);
  clock.time = BOOTSTRAP_RETRY_COOLDOWN_MS;
  expect(bootstrap.request(DOCUMENT_ID).stage).toBe(BootstrapStage.Queued);
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  const [first, second] = issueToken.mock.calls.map(([{ attempt }]) => attempt);
  expect(second).not.toBe(first);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: second! })).toBe(true);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: first! })).toBe(false);
  error.mockRestore();
});

test('a run interrupted by the worker is run once more with a new attempt', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending, issueToken } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending[0]!.reject(new BootstrapInterruptedError());
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Preparing);
  const [first, second] = issueToken.mock.calls.map(([{ attempt }]) => attempt);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: first! })).toBe(false);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: second! })).toBe(true);
  pending[1]!.reject(new BootstrapInterruptedError());
  await vi.waitFor(() => expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Failed));
  expect(pending).toHaveLength(2);
  error.mockRestore();
});

test('a document without an owner is failed without running', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending } = bootstrapWithPendingRuns({ ownerOf: () => null });
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Failed));
  expect(pending).toHaveLength(0);
  error.mockRestore();
});

test('only the attempt of the running bootstrap is current', async () => {
  const { bootstrap, pending, issueToken } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  const [{ attempt }] = issueToken.mock.calls[0]!;
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt })).toBe(true);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: 'another-attempt' })).toBe(false);
  expect(bootstrap.isCurrent({ documentId: OTHER_DOCUMENT_ID, attempt })).toBe(false);
});

test('the attempt of a ready bootstrap stays current until its run ends so its own socket may keep writing', async () => {
  const { bootstrap, pending, issueToken } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: issueToken.mock.calls[0]![0].attempt })).toBe(true);
});

test('the attempt of a finished bootstrap is no longer current, so a host that outlives its run cannot write', async () => {
  const { bootstrap, pending, issueToken } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  pending[0]!.resolve();
  await vi.waitFor(() =>
    expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: issueToken.mock.calls[0]![0].attempt })).toBe(false),
  );
  expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Ready);
});

test('a failed bootstrap has no current attempt, so a surviving host cannot write', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending, issueToken } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending[0]!.reject(new Error('timed out'));
  await vi.waitFor(() => expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Failed));
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: issueToken.mock.calls[0]![0].attempt })).toBe(false);
  error.mockRestore();
});

test('forgetting a queued document keeps it from ever running', async () => {
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  bootstrap.request(OTHER_DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.forget(OTHER_DOCUMENT_ID);
  expect(bootstrap.progressOf(OTHER_DOCUMENT_ID)).toBeNull();
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  pending[0]!.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(pending).toHaveLength(1);
});

test('a begun attempt without a request is current and signs a token for the owner', () => {
  const { bootstrap, issueToken } = bootstrapWithPendingRuns();
  const token = bootstrap.begin(DOCUMENT_ID);
  const [{ attempt }] = issueToken.mock.calls[0]!;
  expect(token).toBe(`token-${attempt}`);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt })).toBe(true);
  expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Preparing);
});

test('preparing reports the bytes of state received so far and never reaches the estimate before ready', async () => {
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.received({ documentId: DOCUMENT_ID, bytes: FRAME_BYTES });
  bootstrap.received({ documentId: DOCUMENT_ID, bytes: FRAME_BYTES });
  expect(bootstrap.progressOf(DOCUMENT_ID)).toMatchObject({
    stage: BootstrapStage.Preparing,
    done: 2 * FRAME_BYTES,
    total: ESTIMATED_BYTES,
  });
  bootstrap.received({ documentId: DOCUMENT_ID, bytes: ESTIMATED_BYTES * 2 });
  expect(bootstrap.progressOf(DOCUMENT_ID)?.done).toBe(ESTIMATED_BYTES - 1);
});

test('bytes received by a document that is not preparing change nothing', () => {
  const { bootstrap } = bootstrapWithPendingRuns();
  bootstrap.received({ documentId: DOCUMENT_ID, bytes: FRAME_BYTES });
  expect(bootstrap.progressOf(DOCUMENT_ID)).toBeNull();
});

test('a document is in flight while it is queued or preparing and neither before, ready nor failed', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  expect(bootstrap.isInFlight(DOCUMENT_ID)).toBe(false);
  bootstrap.request(DOCUMENT_ID);
  bootstrap.request(OTHER_DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.isInFlight(DOCUMENT_ID)).toBe(true);
  expect(bootstrap.isInFlight(OTHER_DOCUMENT_ID)).toBe(true);
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  expect(bootstrap.isInFlight(DOCUMENT_ID)).toBe(false);
  pending[0]!.resolve();
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  pending[1]!.reject(new Error('not a document'));
  await vi.waitFor(() => expect(bootstrap.progressOf(OTHER_DOCUMENT_ID)?.stage).toBe(BootstrapStage.Failed));
  expect(bootstrap.isInFlight(OTHER_DOCUMENT_ID)).toBe(false);
  error.mockRestore();
});
