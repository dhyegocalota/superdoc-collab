import { ProjectionRequestKind, type AnsweredRequest, type ProjectionRequestsByKind } from './projection-messages';

type Enqueuers = { [Kind in ProjectionRequestKind]: (request: ProjectionRequestsByKind[Kind]) => void };

export function createProjectionQueues({
  reply,
  stop,
}: {
  reply: (request: AnsweredRequest) => Promise<void>;
  stop: () => Promise<void>;
}): <Kind extends ProjectionRequestKind>(request: ProjectionRequestsByKind[Kind]) => void {
  let queuePromise = Promise.resolve();
  let importQueuePromise = Promise.resolve();
  let bootstrapQueuePromise = Promise.resolve();

  function enqueueSerial(request: AnsweredRequest): void {
    queuePromise = queuePromise.then(() => reply(request));
  }

  function enqueueImport(request: AnsweredRequest): void {
    importQueuePromise = importQueuePromise.then(() => reply(request));
  }

  function enqueueBootstrap(request: AnsweredRequest): void {
    bootstrapQueuePromise = bootstrapQueuePromise.then(() => reply(request));
  }

  function enqueueAfterImports(request: AnsweredRequest): void {
    queuePromise = Promise.all([queuePromise, importQueuePromise]).then(() => reply(request));
  }

  const enqueuers: Enqueuers = {
    [ProjectionRequestKind.Project]: enqueueSerial,
    [ProjectionRequestKind.Version]: enqueueSerial,
    [ProjectionRequestKind.Blocks]: enqueueSerial,
    [ProjectionRequestKind.Import]: enqueueImport,
    [ProjectionRequestKind.Bootstrap]: enqueueBootstrap,
    [ProjectionRequestKind.Forget]: enqueueAfterImports,
    [ProjectionRequestKind.Stop]: () => {
      queuePromise = queuePromise.then(stop);
    },
    [ProjectionRequestKind.Recycle]: () => {
      queuePromise = Promise.all([queuePromise, importQueuePromise, bootstrapQueuePromise]).then(stop);
    },
  };

  return function enqueue<Kind extends ProjectionRequestKind>(request: ProjectionRequestsByKind[Kind]): void {
    enqueuers[request.kind](request);
  };
}
