import { buildSeedDocx, buildShowcaseParagraphs } from '@superdoc-collab/history';
import { SHOWCASE_TITLE } from '@superdoc-collab/types';
import { storeDocument, type DocumentStorage } from './store-document';

export class ShowcaseDocuments {
  private readonly dependencies: DocumentStorage;
  private readonly now: () => number;

  constructor({ now, ...dependencies }: DocumentStorage & { now: () => number }) {
    this.dependencies = dependencies;
    this.now = now;
  }

  async create({ ownerUserId }: { ownerUserId: string }): Promise<string> {
    const bytes = await buildSeedDocx(buildShowcaseParagraphs({ now: this.now() }));
    return storeDocument({ ...this.dependencies, ownerUserId, title: SHOWCASE_TITLE, bytes, importRevisions: true, isBlank: false });
  }
}
