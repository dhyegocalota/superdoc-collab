import type { AnsweredRequest, ProjectionRequest } from './projection-messages';

export function createProjectionQueues(_options: {
  reply: (request: AnsweredRequest) => Promise<void>;
  stop: () => Promise<void>;
}): (request: ProjectionRequest) => void {
  throw new Error('createProjectionQueues is not implemented');
}
