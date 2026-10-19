import type { DocumentRuntime } from '../collaboration/collaboration-runtime';
import type { DocumentsRepository } from './documents-repository';
import type { DocumentFileStorage } from './file-storage';

export class ShowcaseDocuments {
  constructor(_dependencies: {
    documents: DocumentsRepository;
    storage: DocumentFileStorage;
    runtime: DocumentRuntime;
    now: () => number;
  }) {}

  async create(_input: { ownerUserId: string }): Promise<string> {
    throw new Error('ShowcaseDocuments.create is not implemented');
  }
}
