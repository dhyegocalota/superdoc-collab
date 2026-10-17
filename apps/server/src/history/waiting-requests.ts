import type { BlocksReply, ProjectionRequest, ProjectionRequestKind, VersionReply } from './projection-messages';

export type ServedReply = VersionReply | BlocksReply;
export type ServedRequest = Extract<ProjectionRequest, { kind: ProjectionRequestKind.Version | ProjectionRequestKind.Blocks }>;
type Waiter = { resolve: (reply: ServedReply) => void; reject: (error: Error) => void };

export function requestKeyOf({ kind }: { kind: ServedRequest['kind']; documentId: string; sequence: number | null }): string {
  throw new Error(`requestKeyOf is not implemented: ${kind}`);
}

export class WaitingRequests {
  add({ request }: { request: ServedRequest; waiter: Waiter }): boolean {
    throw new Error(`WaitingRequests.add is not implemented: ${request.kind}`);
  }

  resolve(reply: ServedReply): void {
    throw new Error(`WaitingRequests.resolve is not implemented: ${reply.kind}`);
  }

  reject({ key }: { key: string; error: Error }): void {
    throw new Error(`WaitingRequests.reject is not implemented: ${key}`);
  }

  rejectAll(errorOf: () => Error): void {
    throw new Error(`WaitingRequests.rejectAll is not implemented: ${errorOf.name}`);
  }

  repost({ maxPosts }: { post: (request: ServedRequest) => void; maxPosts: number }): void {
    throw new Error(`WaitingRequests.repost is not implemented: ${maxPosts}`);
  }
}
