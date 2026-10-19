import { expect, test, vi } from 'vitest';
import { ProjectionRequestCrashedError, ProjectionRequestKind, type BlocksReply, type MeasuredReply } from './projection-messages';
import { requestKeyOf, WaitingRequests } from './waiting-requests';

const VERSION_REQUEST = { kind: ProjectionRequestKind.Version, documentId: 'd1', sequence: 3 } as const;
const BLOCKS_REQUEST = { kind: ProjectionRequestKind.Blocks, documentId: 'd1' } as const;

function waiter() {
  return { resolve: vi.fn(), reject: vi.fn() };
}

test('keys name the version sequence and ignore a blocks cursor', () => {
  expect([
    requestKeyOf(VERSION_REQUEST),
    requestKeyOf({ ...BLOCKS_REQUEST, sequence: 7 }),
    requestKeyOf({ ...BLOCKS_REQUEST, sequence: null }),
  ]).toEqual(['version:d1@3', 'blocks:d1', 'blocks:d1']);
});

test('a second waiter joins the first request instead of posting again', () => {
  const requests = new WaitingRequests();
  const [first, second] = [waiter(), waiter()];
  expect([requests.add({ request: BLOCKS_REQUEST, waiter: first }), requests.add({ request: BLOCKS_REQUEST, waiter: second })]).toEqual([
    true,
    false,
  ]);
  const reply: MeasuredReply<BlocksReply> = {
    kind: ProjectionRequestKind.Blocks,
    documentId: 'd1',
    sequence: 9,
    blocks: [],
    retainedHeapBytes: 0,
  };
  requests.resolve(reply);
  expect([first.resolve, second.resolve].map((resolve) => resolve.mock.calls)).toEqual([[[reply]], [[reply]]]);
});

test('a repost past the limit rejects as crashed and posts nothing', () => {
  const requests = new WaitingRequests();
  const pending = waiter();
  requests.add({ request: VERSION_REQUEST, waiter: pending });
  const post = vi.fn();
  requests.repost({ post, maxPosts: 2, countsPosts: true });
  requests.repost({ post, maxPosts: 2, countsPosts: true });
  expect(post.mock.calls).toEqual([[VERSION_REQUEST]]);
  expect(pending.reject.mock.calls[0]![0]).toBeInstanceOf(ProjectionRequestCrashedError);
});

test('rejecting all gives each key its own error', () => {
  const requests = new WaitingRequests();
  const [version, blocks] = [waiter(), waiter()];
  requests.add({ request: VERSION_REQUEST, waiter: version });
  requests.add({ request: BLOCKS_REQUEST, waiter: blocks });
  requests.rejectAll(() => new Error('stopping'));
  expect(version.reject.mock.calls[0]![0]).not.toBe(blocks.reject.mock.calls[0]![0]);
});

test('a repost that does not count its posts never rejects as crashed', () => {
  const requests = new WaitingRequests();
  const first = waiter();
  requests.add({ request: BLOCKS_REQUEST, waiter: first });
  const post = vi.fn();
  Array.from({ length: 3 }).forEach(() => requests.repost({ post, maxPosts: 2, countsPosts: false }));
  expect(post).toHaveBeenCalledTimes(3);
  expect(first.reject).not.toHaveBeenCalled();
});
