import {
  BOOTSTRAP_COMMIT_GRACE_MS,
  BOOTSTRAP_LIGHT_MAX_BYTES,
  BOOTSTRAP_MS_PER_MEGABYTE,
  BYTES_PER_MEGABYTE,
  BOOTSTRAP_QUEUE_RETRY_AFTER_MS,
  BOOTSTRAP_RATE_CLAMP_MULTIPLE,
  BootstrapLane,
  BOOTSTRAP_MAX_RETRIES,
  BOOTSTRAP_RETRY_COOLDOWN_MS,
  BOOTSTRAP_STATE_BYTES_RATIO,
  BootstrapStage,
} from '@superdoc-collab/types';
import { afterEach, expect, test, vi } from 'vitest';
import { BOOTSTRAP_FAILED_MESSAGE, BootstrapInterruptedError, type BootstrapRequest } from '../history/projection-messages';
import { RoomBootstrap } from './room-bootstrap';

const DOCUMENT_ID = 'document-plan';
const OTHER_DOCUMENT_ID = 'document-budget';
const OWNER_ID = 'user-ana';
const FILE_BYTES = 9_500_000;
const STATE_BYTES = 36_600_000;
const ESTIMATED_BYTES = FILE_BYTES * BOOTSTRAP_STATE_BYTES_RATIO;
const ESTIMATED_MS = (FILE_BYTES / BYTES_PER_MEGABYTE) * BOOTSTRAP_MS_PER_MEGABYTE;
const FRAME_BYTES = 1000;
const URL = 'ws://127.0.0.1:4000/collaboration/bootstrap';

type Pending = { request: BootstrapRequest; resolve: () => void; reject: (error: Error) => void };

afterEach(() => {
  vi.useRealTimers();
});

function bootstrapWithPendingRuns({
  ownerOf = () => OWNER_ID,
  now = () => Date.now(),
  documentXmlBytesOf = () => FILE_BYTES,
  commitBlank = () => undefined,
  onEnded = () => undefined,
  spendRetry = () => true,
  isPreparableByServer = () => true,
}: {
  ownerOf?: (documentId: string) => string | null;
  now?: () => number;
  documentXmlBytesOf?: (documentId: string) => number;
  commitBlank?: (committed: { documentId: string; ownerId: string; state: Uint8Array }) => void;
  onEnded?: (documentId: string) => void;
  spendRetry?: (parameters: { ownerId: string | null; documentXmlBytes: number }) => boolean;
  isPreparableByServer?: (documentId: string) => boolean;
} = {}) {
  const pending: Pending[] = [];
  const issueToken = vi.fn(({ attempt }: { userId: string; documentId: string; attempt: string }) => `token-${attempt}`);
  const bootstrap = new RoomBootstrap({
    run: (request) => new Promise<void>((resolve, reject) => pending.push({ request, resolve, reject })),
    issueToken,
    collaborationUrl: () => URL,
    ownerOf,
    documentXmlBytesOf,
    filePathOf: (documentId) => `/files/${documentId}.docx`,
    commitBlank,
    onEnded,
    spendRetry,
    isPreparableByServer,
    now,
  });
  return { bootstrap, pending, issueToken };
}

test('a requested bootstrap is queued with the size of the upload and then prepared', async () => {
  const { bootstrap, pending, issueToken } = bootstrapWithPendingRuns({ now: () => 1_000_000 });
  expect(bootstrap.request(DOCUMENT_ID)).toEqual({
    stage: BootstrapStage.Queued,
    done: 0,
    total: ESTIMATED_BYTES,
    stateBytes: null,
    estimatedMs: ESTIMATED_MS,
    documentXmlBytes: FILE_BYTES,
    preparingElapsedMs: null,
    queuePosition: null,
    queueWaitMs: null,
  });
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.progressOf(DOCUMENT_ID)).toEqual({
    stage: BootstrapStage.Preparing,
    done: 0,
    total: ESTIMATED_BYTES,
    stateBytes: null,
    estimatedMs: ESTIMATED_MS,
    documentXmlBytes: FILE_BYTES,
    preparingElapsedMs: 0,
    queuePosition: null,
    queueWaitMs: null,
  });
  const [{ userId, documentId, attempt }] = issueToken.mock.calls[0]!;
  expect({ userId, documentId }).toEqual({ userId: OWNER_ID, documentId: DOCUMENT_ID });
  expect(pending[0]!.request).toEqual({
    documentId: DOCUMENT_ID,
    filePath: `/files/${DOCUMENT_ID}.docx`,
    url: URL,
    token: `token-${attempt}`,
    lane: BootstrapLane.Heavy,
    documentXmlBytes: FILE_BYTES,
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
    estimatedMs: ESTIMATED_MS,
    documentXmlBytes: FILE_BYTES,
    preparingElapsedMs: null,
    queuePosition: null,
    queueWaitMs: null,
  });
  pending[0]!.resolve();
  await Promise.resolve();
  expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Ready);
});

test('a commit nobody asked for is ready with nothing to process', () => {
  const { bootstrap } = bootstrapWithPendingRuns();
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  expect(bootstrap.progressOf(DOCUMENT_ID)).toEqual({
    stage: BootstrapStage.Ready,
    done: 0,
    total: 0,
    stateBytes: STATE_BYTES,
    estimatedMs: null,
    documentXmlBytes: 0,
    preparingElapsedMs: null,
    queuePosition: null,
    queueWaitMs: null,
  });
});

test('a failed run is reported once, stays failed within the cooldown and is not run again', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending[0]!.reject(new Error('not a document'));
  await vi.waitFor(() => expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Failed));
  expect(bootstrap.progressOf(DOCUMENT_ID)).toEqual({
    stage: BootstrapStage.Failed,
    done: 0,
    total: ESTIMATED_BYTES,
    stateBytes: null,
    estimatedMs: ESTIMATED_MS,
    documentXmlBytes: FILE_BYTES,
    preparingElapsedMs: null,
    queuePosition: null,
    queueWaitMs: null,
  });
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

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const CARLA = 'user-carla';
const SMALL_FILE_BYTES = BOOTSTRAP_LIGHT_MAX_BYTES;
const LARGE_FILE_BYTES = BOOTSTRAP_LIGHT_MAX_BYTES + 1;
const OWNERS: Record<string, string> = {
  'ana-heavy': ANA,
  'ana-heavy-2': ANA,
  'ana-heavy-3': ANA,
  'bruno-heavy': BRUNO,
  'carla-heavy': CARLA,
  'bruno-light': BRUNO,
  'ana-light': ANA,
};

function bootstrapWithOwners() {
  return bootstrapWithPendingRuns({
    ownerOf: (documentId) => OWNERS[documentId]!,
    documentXmlBytesOf: (documentId) => (documentId.endsWith('light') ? SMALL_FILE_BYTES : LARGE_FILE_BYTES),
  });
}

test('a light bootstrap runs at once while a heavy one of another owner is running', async () => {
  const { bootstrap, pending } = bootstrapWithOwners();
  bootstrap.request('ana-heavy');
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.request('bruno-light');
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(pending.map(({ request }) => [request.documentId, request.lane])).toEqual([
    ['ana-heavy', BootstrapLane.Heavy],
    ['bruno-light', BootstrapLane.Light],
  ]);
  expect(bootstrap.progressOf('bruno-light')?.stage).toBe(BootstrapStage.Preparing);
});

test('heavy bootstraps give each owner a turn before an owner gets a second one', async () => {
  const { bootstrap, pending } = bootstrapWithOwners();
  ['ana-heavy', 'ana-heavy-2', 'ana-heavy-3', 'bruno-heavy', 'carla-heavy'].forEach((documentId) => bootstrap.request(documentId));
  const orderOfRuns = async (): Promise<string[]> => {
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    return pending.map(({ request }) => request.documentId);
  };
  expect(await orderOfRuns()).toEqual(['ana-heavy']);
  const finishNext = async (index: number): Promise<void> => {
    bootstrap.ready({ documentId: pending[index]!.request.documentId, stateBytes: STATE_BYTES });
    pending[index]!.resolve();
    await vi.waitFor(() => expect(pending).toHaveLength(index + 2));
  };
  await finishNext(0);
  await finishNext(1);
  await finishNext(2);
  await finishNext(3);
  expect(pending.map(({ request }) => request.documentId)).toEqual([
    'ana-heavy',
    'ana-heavy-2',
    'bruno-heavy',
    'carla-heavy',
    'ana-heavy-3',
  ]);
});

test('an owner is asked to wait only while a bootstrap of theirs is queued in the lane of the new file', async () => {
  const { bootstrap, pending } = bootstrapWithOwners();
  expect(bootstrap.queueWaitMs({ ownerId: ANA, documentXmlBytes: LARGE_FILE_BYTES })).toBeNull();
  bootstrap.request('ana-heavy');
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.queueWaitMs({ ownerId: ANA, documentXmlBytes: LARGE_FILE_BYTES })).toBeNull();
  bootstrap.request('ana-heavy-2');
  expect(bootstrap.queueWaitMs({ ownerId: ANA, documentXmlBytes: LARGE_FILE_BYTES })).toBe(BOOTSTRAP_QUEUE_RETRY_AFTER_MS);
  expect(bootstrap.queueWaitMs({ ownerId: ANA, documentXmlBytes: SMALL_FILE_BYTES })).toBeNull();
  expect(bootstrap.queueWaitMs({ ownerId: BRUNO, documentXmlBytes: LARGE_FILE_BYTES })).toBeNull();
});

const HEAVY_MEGABYTES = 4;
const FIRST_RATE_MS = 2000;
const SECOND_RATE_MS = 4000;

async function completedHeavyConversion({
  bootstrap,
  pending,
  documentId,
  elapsedMs,
  advance,
}: {
  bootstrap: RoomBootstrap;
  pending: Pending[];
  documentId: string;
  elapsedMs: number;
  advance: (milliseconds: number) => void;
}): Promise<void> {
  const index = pending.length;
  bootstrap.request(documentId);
  await vi.waitFor(() => expect(pending).toHaveLength(index + 1));
  advance(elapsedMs);
  bootstrap.ready({ documentId, stateBytes: STATE_BYTES });
  pending[index]!.resolve();
}

test('completed conversions of heavy files move the estimate of the next jobs to the average rate per megabyte', async () => {
  let currentMs = 0;
  const advance = (milliseconds: number) => void (currentMs += milliseconds);
  const { bootstrap, pending } = bootstrapWithPendingRuns({
    now: () => currentMs,
    ownerOf: (documentId) => `owner-of-${documentId}`,
    documentXmlBytesOf: () => HEAVY_MEGABYTES * BYTES_PER_MEGABYTE,
  });
  expect(bootstrap.request('document-first').estimatedMs).toBe(HEAVY_MEGABYTES * BOOTSTRAP_MS_PER_MEGABYTE);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  advance(FIRST_RATE_MS * HEAVY_MEGABYTES);
  bootstrap.ready({ documentId: 'document-first', stateBytes: STATE_BYTES });
  pending[0]!.resolve();
  await completedHeavyConversion({
    bootstrap,
    pending,
    documentId: 'document-second',
    elapsedMs: SECOND_RATE_MS * HEAVY_MEGABYTES,
    advance,
  });
  expect(bootstrap.request('document-third').estimatedMs).toBe(((FIRST_RATE_MS + SECOND_RATE_MS) / 2) * HEAVY_MEGABYTES);
});

test('a 9.5 MB file is estimated at the seeded rate until two owners have had a conversion, then at their mean', async () => {
  let currentMs = 0;
  const { bootstrap, pending } = bootstrapWithPendingRuns({ now: () => currentMs, ownerOf: (documentId) => `owner-of-${documentId}` });
  const megabytes = FILE_BYTES / BYTES_PER_MEGABYTE;
  expect(bootstrap.request('document-first').estimatedMs).toBeCloseTo(megabytes * BOOTSTRAP_MS_PER_MEGABYTE);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  currentMs += 50_000;
  bootstrap.ready({ documentId: 'document-first', stateBytes: STATE_BYTES });
  pending[0]!.resolve();
  await vi.waitFor(() => expect(bootstrap.progressOf('document-first')?.stage).toBe(BootstrapStage.Ready));
  expect(bootstrap.request('document-second').estimatedMs).toBeCloseTo(megabytes * BOOTSTRAP_MS_PER_MEGABYTE);
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  currentMs += 30_000;
  bootstrap.ready({ documentId: 'document-second', stateBytes: STATE_BYTES });
  pending[1]!.resolve();
  await vi.waitFor(() => expect(bootstrap.progressOf('document-second')?.stage).toBe(BootstrapStage.Ready));
  expect(bootstrap.request('document-third').estimatedMs).toBeCloseTo(40_000);
});

test('the conversion of a small file never moves the rate, whatever its fixed cost', async () => {
  let currentMs = 0;
  const { bootstrap, pending } = bootstrapWithPendingRuns({ now: () => currentMs, documentXmlBytesOf: () => SMALL_FILE_BYTES });
  bootstrap.request('document-small');
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  currentMs += 1000;
  bootstrap.ready({ documentId: 'document-small', stateBytes: STATE_BYTES });
  pending[0]!.resolve();
  await vi.waitFor(() => expect(bootstrap.progressOf('document-small')?.stage).toBe(BootstrapStage.Ready));
  const nextEstimate = bootstrap.request('document-next').estimatedMs;
  expect(nextEstimate).toBeCloseTo((SMALL_FILE_BYTES / BYTES_PER_MEGABYTE) * BOOTSTRAP_MS_PER_MEGABYTE);
});

test('preparingElapsedMs is the time since Preparing began at each answer and null before and after it', async () => {
  let currentMs = 1_000_000;
  const { bootstrap, pending } = bootstrapWithPendingRuns({ now: () => currentMs });
  expect(bootstrap.request(DOCUMENT_ID).preparingElapsedMs).toBeNull();
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.progressOf(DOCUMENT_ID)!.preparingElapsedMs).toBe(0);
  currentMs += 5000;
  expect(bootstrap.progressOf(DOCUMENT_ID)!.preparingElapsedMs).toBe(5000);
  currentMs += 2500;
  expect(bootstrap.progressOf(DOCUMENT_ID)!.preparingElapsedMs).toBe(7500);
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  expect(bootstrap.progressOf(DOCUMENT_ID)!.preparingElapsedMs).toBeNull();
});

const BLANK_STATE = new Uint8Array([1, 2, 3, 4]);

function blankScenario() {
  const committed: { documentId: string; ownerId: string; state: Uint8Array }[] = [];
  const scenario: { bootstrap: RoomBootstrap | null } = { bootstrap: null };
  const parts = bootstrapWithPendingRuns({
    commitBlank: (blank) => {
      committed.push(blank);
      scenario.bootstrap!.ready({ documentId: blank.documentId, stateBytes: blank.state.byteLength });
    },
  });
  scenario.bootstrap = parts.bootstrap;
  return { ...parts, committed };
}

test('the first blank document converts in a lane, and a blank requested meanwhile waits for its state instead of converting again', async () => {
  const { bootstrap, pending, committed } = blankScenario();
  bootstrap.requestBlank(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.requestBlank(OTHER_DOCUMENT_ID).stage).toBe(BootstrapStage.Queued);
  expect(pending).toHaveLength(1);
  expect(bootstrap.isInFlight(OTHER_DOCUMENT_ID)).toBe(true);
  expect(committed).toEqual([]);
});

test('when the first blank commits, the blanks that waited are committed from its state at once and are ready', async () => {
  const { bootstrap, pending, committed } = blankScenario();
  bootstrap.requestBlank(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.requestBlank(OTHER_DOCUMENT_ID);
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: BLANK_STATE.byteLength });
  bootstrap.blankCommitted({ documentId: DOCUMENT_ID, state: BLANK_STATE });
  expect(committed).toEqual([{ documentId: OTHER_DOCUMENT_ID, ownerId: OWNER_ID, state: BLANK_STATE }]);
  expect(bootstrap.progressOf(OTHER_DOCUMENT_ID)).toMatchObject({ stage: BootstrapStage.Ready, stateBytes: BLANK_STATE.byteLength });
});

test('a blank requested after the state is known is ready in the answer itself and never runs in a lane', async () => {
  const { bootstrap, pending, committed } = blankScenario();
  bootstrap.requestBlank(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: BLANK_STATE.byteLength });
  bootstrap.blankCommitted({ documentId: DOCUMENT_ID, state: BLANK_STATE });
  expect(bootstrap.requestBlank(OTHER_DOCUMENT_ID).stage).toBe(BootstrapStage.Ready);
  expect(committed.map(({ documentId }) => documentId)).toEqual([OTHER_DOCUMENT_ID]);
  expect(pending).toHaveLength(1);
});

test('when the first blank fails, the blanks that waited convert on their own', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending, committed } = blankScenario();
  bootstrap.requestBlank(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.requestBlank(OTHER_DOCUMENT_ID);
  pending[0]!.reject(new Error('host died'));
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(pending[1]!.request.documentId).toBe(OTHER_DOCUMENT_ID);
  expect(committed).toEqual([]);
});

test('forgetting the blank that waits keeps it from ever being committed', async () => {
  const { bootstrap, pending, committed } = blankScenario();
  bootstrap.requestBlank(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.requestBlank(OTHER_DOCUMENT_ID);
  bootstrap.forget(OTHER_DOCUMENT_ID);
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: BLANK_STATE.byteLength });
  bootstrap.blankCommitted({ documentId: DOCUMENT_ID, state: BLANK_STATE });
  expect(committed).toEqual([]);
});

test('a blank whose commit from the state throws is prepared in the lane instead, and the failure is logged once', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending } = bootstrapWithPendingRuns({
    commitBlank: () => {
      throw new Error('state refused');
    },
  });
  bootstrap.requestBlank(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: BLANK_STATE.byteLength });
  bootstrap.blankCommitted({ documentId: DOCUMENT_ID, state: BLANK_STATE });
  expect(bootstrap.requestBlank(OTHER_DOCUMENT_ID).stage).toBe(BootstrapStage.Queued);
  pending[0]!.resolve();
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(pending[1]!.request.documentId).toBe(OTHER_DOCUMENT_ID);
  expect(logged).toHaveBeenCalledTimes(1);
});

test('a blank that waited and whose commit from the state throws is prepared in the lane instead', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap, pending } = bootstrapWithPendingRuns({
    commitBlank: () => {
      throw new Error('state refused');
    },
  });
  bootstrap.requestBlank(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  bootstrap.requestBlank(OTHER_DOCUMENT_ID);
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: BLANK_STATE.byteLength });
  bootstrap.blankCommitted({ documentId: DOCUMENT_ID, state: BLANK_STATE });
  pending[0]!.resolve();
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(pending[1]!.request.documentId).toBe(OTHER_DOCUMENT_ID);
});

const OTHER_USER_ID = 'user-bruno';

function deviceBootstrap(options: Parameters<typeof bootstrapWithPendingRuns>[0] = {}) {
  return bootstrapWithPendingRuns({ isPreparableByServer: () => false, now: () => 1_000_000, ...options });
}

test('a document the server cannot hold is prepared on the device of its owner and never queued', async () => {
  const { bootstrap, pending } = deviceBootstrap();
  expect(bootstrap.request(DOCUMENT_ID)).toEqual({
    stage: BootstrapStage.Preparing,
    done: 0,
    total: ESTIMATED_BYTES,
    stateBytes: null,
    estimatedMs: ESTIMATED_MS,
    documentXmlBytes: FILE_BYTES,
    preparingElapsedMs: 0,
    queuePosition: null,
    queueWaitMs: null,
  });
  await Promise.resolve();
  expect(pending).toHaveLength(0);
  expect(bootstrap.isDevicePending(DOCUMENT_ID)).toBe(true);
});

test('a document the server can hold is not a device job', () => {
  const { bootstrap } = bootstrapWithPendingRuns();
  bootstrap.request(DOCUMENT_ID);
  expect(bootstrap.isDevicePending(DOCUMENT_ID)).toBe(false);
  expect(bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })).toBeNull();
});

test('the owner claims a device job and the claim is the current attempt', () => {
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  const attempt = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null });
  expect(attempt).not.toBeNull();
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: attempt! })).toBe(true);
});

test('a person who is not the owner cannot claim a device job', () => {
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  expect(bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OTHER_USER_ID, tabId: null })).toBeNull();
});

test('a second claim supersedes the first and the first is no longer current', () => {
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  const first = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })!;
  const second = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })!;
  expect(second).not.toBe(first);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: first })).toBe(false);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: second })).toBe(true);
});

test('the bytes the claimed device sends raise the progress', () => {
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null });
  bootstrap.received({ documentId: DOCUMENT_ID, bytes: FRAME_BYTES });
  expect(bootstrap.progressOf(DOCUMENT_ID)!.done).toBe(FRAME_BYTES);
});

test('the commit makes a device job Ready, keeps the committing attempt writing and refuses a later claim', () => {
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  const attempt = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })!;
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  expect(bootstrap.progressOf(DOCUMENT_ID)!.stage).toBe(BootstrapStage.Ready);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt })).toBe(true);
  expect(bootstrap.isDevicePending(DOCUMENT_ID)).toBe(false);
  expect(bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })).toBeNull();
});

test('the claimed device closing before the commit fails the job once, and the owner claims it again', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  const attempt = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })!;
  bootstrap.deviceClosed({ documentId: DOCUMENT_ID, attempt });
  expect(bootstrap.progressOf(DOCUMENT_ID)!.stage).toBe(BootstrapStage.Failed);
  expect(error).toHaveBeenCalledTimes(1);
  expect(error.mock.calls[0]![0]).toContain(BOOTSTRAP_FAILED_MESSAGE);
  expect(bootstrap.isDevicePending(DOCUMENT_ID)).toBe(true);
  const again = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null });
  expect(again).not.toBeNull();
  expect(bootstrap.progressOf(DOCUMENT_ID)!.stage).toBe(BootstrapStage.Preparing);
  error.mockRestore();
});

const TAB_ID = 'tab-ana-laptop';
const OTHER_TAB_ID = 'tab-ana-phone';

test('a second socket of the claiming tab shares the attempt, and another tab supersedes it', () => {
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  const first = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: TAB_ID })!;
  const sameTab = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: TAB_ID })!;
  const otherTab = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: OTHER_TAB_ID })!;
  expect(sameTab).toBe(first);
  expect(otherTab).not.toBe(first);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: first })).toBe(false);
});

test('the job fails only when the last socket of the claiming tab closes before the commit', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  const attempt = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: TAB_ID })!;
  bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: TAB_ID });
  bootstrap.deviceClosed({ documentId: DOCUMENT_ID, attempt });
  expect(bootstrap.progressOf(DOCUMENT_ID)!.stage).toBe(BootstrapStage.Preparing);
  bootstrap.deviceClosed({ documentId: DOCUMENT_ID, attempt });
  expect(bootstrap.progressOf(DOCUMENT_ID)!.stage).toBe(BootstrapStage.Failed);
  error.mockRestore();
});

test('a superseded device closing changes nothing', () => {
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  const first = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })!;
  const second = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })!;
  bootstrap.deviceClosed({ documentId: DOCUMENT_ID, attempt: first });
  expect(bootstrap.progressOf(DOCUMENT_ID)!.stage).toBe(BootstrapStage.Preparing);
  expect(bootstrap.isCurrent({ documentId: DOCUMENT_ID, attempt: second })).toBe(true);
});

test('only the owner of a pending device job is its creator', () => {
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  expect([
    bootstrap.isDeviceCreator({ documentId: DOCUMENT_ID, userId: OWNER_ID }),
    bootstrap.isDeviceCreator({ documentId: DOCUMENT_ID, userId: OTHER_USER_ID }),
  ]).toEqual([true, false]);
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  expect(bootstrap.isDeviceCreator({ documentId: DOCUMENT_ID, userId: OWNER_ID })).toBe(false);
});

test('the committing device closing after the commit leaves the job Ready', () => {
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  const attempt = bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })!;
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  bootstrap.deviceClosed({ documentId: DOCUMENT_ID, attempt });
  expect(bootstrap.progressOf(DOCUMENT_ID)!.stage).toBe(BootstrapStage.Ready);
});

test('a failed device job is still the owner to claim, so a reopen converts again', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { bootstrap } = deviceBootstrap();
  bootstrap.request(DOCUMENT_ID);
  bootstrap.deviceClosed({
    documentId: DOCUMENT_ID,
    attempt: bootstrap.claimDevice({ documentId: DOCUMENT_ID, userId: OWNER_ID, tabId: null })!,
  });
  expect(bootstrap.isDeviceCreator({ documentId: DOCUMENT_ID, userId: OWNER_ID })).toBe(true);
  error.mockRestore();
});

const LARGE_ESTIMATED_MS = (LARGE_FILE_BYTES / BYTES_PER_MEGABYTE) * BOOTSTRAP_MS_PER_MEGABYTE;

function clockedBootstrapWithOwners() {
  const clock = { currentMs: 1_000_000 };
  const parts = bootstrapWithPendingRuns({
    ownerOf: (documentId) => OWNERS[documentId]!,
    documentXmlBytesOf: (documentId) => (documentId.endsWith('light') ? SMALL_FILE_BYTES : LARGE_FILE_BYTES),
    now: () => clock.currentMs,
  });
  return { ...parts, clock };
}

test('a queued document reports the documents ahead of it, the running one included, and the wait they cost', async () => {
  const { bootstrap, pending } = clockedBootstrapWithOwners();
  ['ana-heavy', 'bruno-heavy', 'carla-heavy'].forEach((documentId) => bootstrap.request(documentId));
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  const running = bootstrap.progressOf('ana-heavy')!;
  const second = bootstrap.progressOf('bruno-heavy')!;
  const third = bootstrap.progressOf('carla-heavy')!;
  expect([running.queuePosition, running.queueWaitMs]).toEqual([null, null]);
  expect(second.queuePosition).toBe(1);
  expect(second.queueWaitMs).toBeCloseTo(LARGE_ESTIMATED_MS);
  expect(third.queuePosition).toBe(2);
  expect(third.queueWaitMs).toBeCloseTo(2 * LARGE_ESTIMATED_MS);
});

test('the position follows the turns of the owners, so a second document of one owner waits behind the others', async () => {
  const { bootstrap, pending } = clockedBootstrapWithOwners();
  ['ana-heavy', 'ana-heavy-2', 'ana-heavy-3', 'bruno-heavy'].forEach((documentId) => bootstrap.request(documentId));
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(['ana-heavy-2', 'bruno-heavy', 'ana-heavy-3'].map((documentId) => bootstrap.progressOf(documentId)!.queuePosition)).toEqual([
    1, 2, 3,
  ]);
});

test('the running document counts only what is left of its estimate, and a document that is no longer queued has no position', async () => {
  const { bootstrap, pending, clock } = clockedBootstrapWithOwners();
  ['ana-heavy', 'bruno-heavy'].forEach((documentId) => bootstrap.request(documentId));
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  clock.currentMs += 4000;
  expect(bootstrap.progressOf('bruno-heavy')!.queueWaitMs).toBeCloseTo(LARGE_ESTIMATED_MS - 4000);
  bootstrap.ready({ documentId: 'ana-heavy', stateBytes: STATE_BYTES });
  pending[0]!.resolve();
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(bootstrap.progressOf('bruno-heavy')).toMatchObject({ stage: BootstrapStage.Preparing, queuePosition: null, queueWaitMs: null });
});

test('the predicted wait of a new heavy job is what is left of the running one plus every queued one, at the measured rate', async () => {
  const { bootstrap, pending, clock } = clockedBootstrapWithOwners();
  expect(bootstrap.predictedWaitMs({ documentXmlBytes: LARGE_FILE_BYTES, ownerId: CARLA })).toBe(0);
  bootstrap.request('ana-heavy');
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.predictedWaitMs({ documentXmlBytes: LARGE_FILE_BYTES, ownerId: CARLA })).toBeCloseTo(LARGE_ESTIMATED_MS);
  bootstrap.request('bruno-heavy');
  clock.currentMs += 4000;
  expect(bootstrap.predictedWaitMs({ documentXmlBytes: LARGE_FILE_BYTES, ownerId: CARLA })).toBeCloseTo(2 * LARGE_ESTIMATED_MS - 4000);
  expect(bootstrap.predictedWaitMs({ documentXmlBytes: SMALL_FILE_BYTES, ownerId: CARLA })).toBe(0);
  bootstrap.ready({ documentId: 'ana-heavy', stateBytes: STATE_BYTES });
  pending[0]!.resolve();
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(bootstrap.predictedWaitMs({ documentXmlBytes: LARGE_FILE_BYTES, ownerId: CARLA })).toBeGreaterThan(0);
});

test("a requester waits only for the turns ahead of them, so another owner's backlog is not all added to their prediction", async () => {
  const { bootstrap, pending } = clockedBootstrapWithOwners();
  ['ana-heavy', 'ana-heavy-2', 'ana-heavy-3', 'bruno-heavy'].forEach((documentId) => bootstrap.request(documentId));
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(bootstrap.predictedWaitMs({ documentXmlBytes: LARGE_FILE_BYTES, ownerId: CARLA })).toBeCloseTo(3 * LARGE_ESTIMATED_MS);
  expect(bootstrap.predictedWaitMs({ documentXmlBytes: LARGE_FILE_BYTES, ownerId: ANA })).toBeCloseTo(4 * LARGE_ESTIMATED_MS);
});

const OWNER_RATES_MEGABYTES = 4;

function conversionsByOwner() {
  const clock = { currentMs: 0 };
  const parts = bootstrapWithPendingRuns({
    now: () => clock.currentMs,
    ownerOf: (documentId) => OWNERS_BY_PREFIX[documentId.split('-')[0]!]!,
    documentXmlBytesOf: () => OWNER_RATES_MEGABYTES * BYTES_PER_MEGABYTE,
  });
  async function convert({ documentId, msPerMegabyte }: { documentId: string; msPerMegabyte: number }): Promise<number> {
    const index = parts.pending.length;
    const estimatedMs = parts.bootstrap.request(documentId).estimatedMs!;
    await vi.waitFor(() => expect(parts.pending).toHaveLength(index + 1));
    clock.currentMs += msPerMegabyte * OWNER_RATES_MEGABYTES;
    parts.bootstrap.ready({ documentId, stateBytes: STATE_BYTES });
    parts.pending[index]!.resolve();
    await vi.waitFor(() => expect(parts.bootstrap.progressOf(documentId)?.stage).toBe(BootstrapStage.Ready));
    return estimatedMs;
  }
  return { ...parts, convert };
}

const OWNERS_BY_PREFIX: Record<string, string> = { ana: ANA, bruno: BRUNO, carla: CARLA };
const MEGABYTES_ESTIMATED = (msPerMegabyte: number) => msPerMegabyte * OWNER_RATES_MEGABYTES;

test('one owner alone never moves the rate, and from two owners it is the mean of their latest samples', async () => {
  const { convert } = conversionsByOwner();
  await convert({ documentId: 'ana-1', msPerMegabyte: 2000 });
  expect(await convert({ documentId: 'ana-2', msPerMegabyte: 4000 })).toBeCloseTo(MEGABYTES_ESTIMATED(BOOTSTRAP_MS_PER_MEGABYTE));
  expect(await convert({ documentId: 'ana-3', msPerMegabyte: 4000 })).toBeCloseTo(MEGABYTES_ESTIMATED(BOOTSTRAP_MS_PER_MEGABYTE));
  expect(await convert({ documentId: 'bruno-1', msPerMegabyte: 2000 })).toBeCloseTo(MEGABYTES_ESTIMATED(BOOTSTRAP_MS_PER_MEGABYTE));
  expect(await convert({ documentId: 'bruno-2', msPerMegabyte: 2000 })).toBeCloseTo(MEGABYTES_ESTIMATED(3000));
});

test('the measured rate stays within a small multiple of the seeded rate, however slow or fast the conversions were', async () => {
  const slow = conversionsByOwner();
  await slow.convert({ documentId: 'ana-1', msPerMegabyte: 100 * BOOTSTRAP_MS_PER_MEGABYTE });
  await slow.convert({ documentId: 'bruno-1', msPerMegabyte: 100 * BOOTSTRAP_MS_PER_MEGABYTE });
  expect(await slow.convert({ documentId: 'carla-1', msPerMegabyte: BOOTSTRAP_MS_PER_MEGABYTE })).toBeCloseTo(
    MEGABYTES_ESTIMATED(BOOTSTRAP_RATE_CLAMP_MULTIPLE * BOOTSTRAP_MS_PER_MEGABYTE),
  );
  const fast = conversionsByOwner();
  await fast.convert({ documentId: 'ana-1', msPerMegabyte: 0 });
  await fast.convert({ documentId: 'bruno-1', msPerMegabyte: 0 });
  expect(await fast.convert({ documentId: 'carla-1', msPerMegabyte: BOOTSTRAP_MS_PER_MEGABYTE })).toBeCloseTo(
    MEGABYTES_ESTIMATED(BOOTSTRAP_MS_PER_MEGABYTE / BOOTSTRAP_RATE_CLAMP_MULTIPLE),
  );
});

test('the end of a bootstrap is reported once, whether it committed, failed or was forgotten while waiting', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const onEnded = vi.fn();
  const { bootstrap, pending } = bootstrapWithPendingRuns({ onEnded, ownerOf: (documentId) => `owner-of-${documentId}` });
  ['committed', 'failed', 'waiting'].forEach((documentId) => bootstrap.request(documentId));
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(onEnded).not.toHaveBeenCalled();
  bootstrap.ready({ documentId: 'committed', stateBytes: STATE_BYTES });
  pending[0]!.resolve();
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(onEnded.mock.calls).toEqual([['committed']]);
  pending[1]!.reject(new Error('not a document'));
  await vi.waitFor(() => expect(onEnded.mock.calls).toEqual([['committed'], ['failed']]));
  bootstrap.forget('waiting');
  expect(onEnded.mock.calls).toEqual([['committed'], ['failed'], ['waiting']]);
  error.mockRestore();
});

async function failedOnce({
  bootstrap,
  pending,
  clock,
}: {
  bootstrap: RoomBootstrap;
  pending: Pending[];
  clock: { currentMs: number };
}): Promise<void> {
  const runs = pending.length;
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(runs + 1));
  pending[runs]!.reject(new Error('not a document'));
  await vi.waitFor(() => expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Failed));
  clock.currentMs += BOOTSTRAP_RETRY_COOLDOWN_MS;
}

test('a failed document is started again at most BOOTSTRAP_MAX_RETRIES times, then it stays failed until it is uploaded again', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const clock = { currentMs: 1_000_000 };
  const { bootstrap, pending } = bootstrapWithPendingRuns({ now: () => clock.currentMs });
  await failedOnce({ bootstrap, pending, clock });
  await Array.from({ length: BOOTSTRAP_MAX_RETRIES }).reduce<Promise<void>>(
    (previous) => previous.then(() => failedOnce({ bootstrap, pending, clock })),
    Promise.resolve(),
  );
  expect(pending).toHaveLength(1 + BOOTSTRAP_MAX_RETRIES);
  expect(bootstrap.request(DOCUMENT_ID).stage).toBe(BootstrapStage.Failed);
  expect(pending).toHaveLength(1 + BOOTSTRAP_MAX_RETRIES);
  bootstrap.forget(DOCUMENT_ID);
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(2 + BOOTSTRAP_MAX_RETRIES));
  error.mockRestore();
});

test('a retry is started only when the owner may spend a heavy conversion on it, and the file asked about is the one retried', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const clock = { currentMs: 1_000_000 };
  const spendRetry = vi.fn(() => false);
  const { bootstrap, pending } = bootstrapWithPendingRuns({ now: () => clock.currentMs, spendRetry });
  await failedOnce({ bootstrap, pending, clock });
  expect(bootstrap.request(DOCUMENT_ID).stage).toBe(BootstrapStage.Failed);
  expect(pending).toHaveLength(1);
  expect(spendRetry).toHaveBeenCalledExactlyOnceWith({ ownerId: OWNER_ID, documentXmlBytes: FILE_BYTES });
  spendRetry.mockReturnValue(true);
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  error.mockRestore();
});

test('a document that was never started is not a retry, and one that succeeded does not count its earlier failures', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const clock = { currentMs: 1_000_000 };
  const spendRetry = vi.fn(() => true);
  const { bootstrap, pending } = bootstrapWithPendingRuns({ now: () => clock.currentMs, spendRetry });
  await failedOnce({ bootstrap, pending, clock });
  bootstrap.request(DOCUMENT_ID);
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  bootstrap.ready({ documentId: DOCUMENT_ID, stateBytes: STATE_BYTES });
  pending[1]!.resolve();
  await vi.waitFor(() => expect(bootstrap.progressOf(DOCUMENT_ID)?.stage).toBe(BootstrapStage.Ready));
  expect(spendRetry).toHaveBeenCalledTimes(1);
  error.mockRestore();
});
