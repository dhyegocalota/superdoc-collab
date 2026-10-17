import {
  ProjectionRequestCrashedError,
  ProjectionRequestKind,
  type BlocksReply,
  type ProjectionRequest,
  type VersionReply,
} from './projection-messages';

export type ServedReply = VersionReply | BlocksReply;
export type ServedRequest = Extract<ProjectionRequest, { kind: ProjectionRequestKind.Version | ProjectionRequestKind.Blocks }>;
type Waiter = { resolve: (reply: ServedReply) => void; reject: (error: Error) => void };
type WaitingRequest = { request: ServedRequest; waiters: Waiter[]; posts: number };

export function requestKeyOf({
  kind,
  documentId,
  sequence,
}: {
  kind: ServedRequest['kind'];
  documentId: string;
  sequence: number | null;
}): string {
  if (kind === ProjectionRequestKind.Version) return `${kind}:${documentId}@${sequence}`;
  return `${kind}:${documentId}`;
}

function keyOfRequest(request: ServedRequest): string {
  if (request.kind === ProjectionRequestKind.Version) return requestKeyOf(request);
  return requestKeyOf({ ...request, sequence: null });
}

export class WaitingRequests {
  private readonly waiting = new Map<string, WaitingRequest>();

  add({ request, waiter }: { request: ServedRequest; waiter: Waiter }): boolean {
    const key = keyOfRequest(request);
    const existing = this.waiting.get(key);
    if (existing) {
      existing.waiters.push(waiter);
      return false;
    }
    this.waiting.set(key, { request, waiters: [waiter], posts: 1 });
    return true;
  }

  resolve(reply: ServedReply): void {
    const entry = this.take(requestKeyOf(reply));
    if (entry) entry.waiters.forEach(({ resolve }) => resolve(reply));
  }

  reject({ key, error }: { key: string; error: Error }): void {
    const entry = this.take(key);
    if (entry) entry.waiters.forEach(({ reject }) => reject(error));
  }

  rejectAll(errorOf: () => Error): void {
    [...this.waiting.keys()].forEach((key) => this.reject({ key, error: errorOf() }));
  }

  repost({ post, maxPosts }: { post: (request: ServedRequest) => void; maxPosts: number }): void {
    [...this.waiting].forEach(([key, waiting]) => {
      if (waiting.posts >= maxPosts) return this.reject({ key, error: new ProjectionRequestCrashedError() });
      waiting.posts += 1;
      post(waiting.request);
    });
  }

  private take(key: string): WaitingRequest | null {
    const entry = this.waiting.get(key);
    this.waiting.delete(key);
    if (!entry) return null;
    return entry;
  }
}
