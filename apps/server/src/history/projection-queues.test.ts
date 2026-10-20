import { BootstrapLane } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { ProjectionRequestKind, type AnsweredRequest, type ProjectionRequest } from './projection-messages';
import { createProjectionQueues } from './projection-queues';

const DOCUMENT_ID = 'd1';
const REQUESTS: Record<ProjectionRequestKind, ProjectionRequest> = {
  [ProjectionRequestKind.Project]: { kind: ProjectionRequestKind.Project, documentId: DOCUMENT_ID },
  [ProjectionRequestKind.Import]: { kind: ProjectionRequestKind.Import, documentId: DOCUMENT_ID, filePath: 'plan.docx' },
  [ProjectionRequestKind.Forget]: { kind: ProjectionRequestKind.Forget, documentId: DOCUMENT_ID },
  [ProjectionRequestKind.Version]: { kind: ProjectionRequestKind.Version, documentId: DOCUMENT_ID, sequence: 3 },
  [ProjectionRequestKind.Blocks]: { kind: ProjectionRequestKind.Blocks, documentId: DOCUMENT_ID },
  [ProjectionRequestKind.Bootstrap]: {
    kind: ProjectionRequestKind.Bootstrap,
    documentId: DOCUMENT_ID,
    filePath: 'plan.docx',
    url: 'ws://127.0.0.1:1',
    token: 'token',
    lane: BootstrapLane.Heavy,
    documentXmlBytes: 1024,
  },
  [ProjectionRequestKind.Stop]: { kind: ProjectionRequestKind.Stop },
  [ProjectionRequestKind.Recycle]: { kind: ProjectionRequestKind.Recycle },
  [ProjectionRequestKind.Measure]: { kind: ProjectionRequestKind.Measure },
};

function queuesHoldingReplyOf(heldKind: ProjectionRequestKind) {
  const events: string[] = [];
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reply = vi.fn(async (request: AnsweredRequest) => {
    if (request.kind === heldKind) await held;
    events.push(request.kind);
  });
  const stop = vi.fn(async () => {
    events.push(ProjectionRequestKind.Stop);
  });
  const measure = vi.fn(async () => {
    events.push(ProjectionRequestKind.Measure);
  });
  const enqueue = createProjectionQueues({ reply, stop, measure });
  return { events, release, enqueue };
}

test('a stop after a pending import stops without waiting for the import reply', async () => {
  const { events, release, enqueue } = queuesHoldingReplyOf(ProjectionRequestKind.Import);
  enqueue(REQUESTS[ProjectionRequestKind.Import]);
  enqueue(REQUESTS[ProjectionRequestKind.Stop]);
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Stop]);
  release();
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Stop, ProjectionRequestKind.Import]);
});

test('a forget waits for the pending import reply', async () => {
  const { events, release, enqueue } = queuesHoldingReplyOf(ProjectionRequestKind.Import);
  enqueue(REQUESTS[ProjectionRequestKind.Import]);
  enqueue(REQUESTS[ProjectionRequestKind.Forget]);
  enqueue(REQUESTS[ProjectionRequestKind.Project]);
  release();
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Import, ProjectionRequestKind.Forget, ProjectionRequestKind.Project]);
});

test('a pending import does not hold back a project', async () => {
  const { events, release, enqueue } = queuesHoldingReplyOf(ProjectionRequestKind.Import);
  enqueue(REQUESTS[ProjectionRequestKind.Import]);
  enqueue(REQUESTS[ProjectionRequestKind.Project]);
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Project]);
  release();
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Project, ProjectionRequestKind.Import]);
});

test('a pending bootstrap holds back neither a project nor a forget', async () => {
  const { events, release, enqueue } = queuesHoldingReplyOf(ProjectionRequestKind.Bootstrap);
  enqueue(REQUESTS[ProjectionRequestKind.Bootstrap]);
  enqueue(REQUESTS[ProjectionRequestKind.Project]);
  enqueue(REQUESTS[ProjectionRequestKind.Forget]);
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Project, ProjectionRequestKind.Forget]);
  release();
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Project, ProjectionRequestKind.Forget, ProjectionRequestKind.Bootstrap]);
});

test('bootstraps run one after another', async () => {
  const { events, release, enqueue } = queuesHoldingReplyOf(ProjectionRequestKind.Bootstrap);
  enqueue(REQUESTS[ProjectionRequestKind.Bootstrap]);
  enqueue({ ...REQUESTS[ProjectionRequestKind.Bootstrap], documentId: 'd2' } as ProjectionRequest);
  release();
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Bootstrap, ProjectionRequestKind.Bootstrap]);
});

test('a light bootstrap is answered while a heavy one is still pending', async () => {
  const answered: string[] = [];
  const heavy = { ...REQUESTS[ProjectionRequestKind.Bootstrap], documentId: 'heavy', lane: BootstrapLane.Heavy } as ProjectionRequest;
  const light = { ...REQUESTS[ProjectionRequestKind.Bootstrap], documentId: 'light', lane: BootstrapLane.Light } as ProjectionRequest;
  let releaseHeavy: () => void = () => undefined;
  const heavyHeld = new Promise<void>((resolve) => {
    releaseHeavy = resolve;
  });
  const enqueue = createProjectionQueues({
    reply: async (request: AnsweredRequest) => {
      if (request.documentId === 'heavy') await heavyHeld;
      answered.push(request.documentId);
    },
    stop: async () => undefined,
    measure: async () => undefined,
  });
  enqueue(heavy);
  enqueue(light);
  await expect.poll(() => answered).toEqual(['light']);
  releaseHeavy();
  await expect.poll(() => answered).toEqual(['light', 'heavy']);
});

test('project, version, blocks and stop run one after another in arrival order', async () => {
  const { events, release, enqueue } = queuesHoldingReplyOf(ProjectionRequestKind.Project);
  [ProjectionRequestKind.Project, ProjectionRequestKind.Version, ProjectionRequestKind.Blocks, ProjectionRequestKind.Stop].forEach((kind) =>
    enqueue(REQUESTS[kind]),
  );
  release();
  await expect
    .poll(() => events)
    .toEqual([ProjectionRequestKind.Project, ProjectionRequestKind.Version, ProjectionRequestKind.Blocks, ProjectionRequestKind.Stop]);
});

test.each([ProjectionRequestKind.Import, ProjectionRequestKind.Bootstrap])('a recycle waits for the pending %s reply', async (heldKind) => {
  const { events, release, enqueue } = queuesHoldingReplyOf(heldKind);
  enqueue(REQUESTS[heldKind]);
  enqueue(REQUESTS[ProjectionRequestKind.Recycle]);
  await new Promise((resolve) => setImmediate(resolve));
  expect(events).toEqual([]);
  release();
  await expect.poll(() => events).toEqual([heldKind, ProjectionRequestKind.Stop]);
});

test('a recycle waits for a pending light bootstrap reply', async () => {
  const { events, release, enqueue } = queuesHoldingReplyOf(ProjectionRequestKind.Bootstrap);
  enqueue({ ...REQUESTS[ProjectionRequestKind.Bootstrap], lane: BootstrapLane.Light } as ProjectionRequest);
  enqueue(REQUESTS[ProjectionRequestKind.Recycle]);
  await new Promise((resolve) => setImmediate(resolve));
  expect(events).toEqual([]);
  release();
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Bootstrap, ProjectionRequestKind.Stop]);
});

test('a measure runs after the pending serial replies and not before', async () => {
  const { events, release, enqueue } = queuesHoldingReplyOf(ProjectionRequestKind.Blocks);
  enqueue(REQUESTS[ProjectionRequestKind.Blocks]);
  enqueue(REQUESTS[ProjectionRequestKind.Measure]);
  await new Promise((resolve) => setImmediate(resolve));
  expect(events).toEqual([]);
  release();
  await expect.poll(() => events).toEqual([ProjectionRequestKind.Blocks, ProjectionRequestKind.Measure]);
});
