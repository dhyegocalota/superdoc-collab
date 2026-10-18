import type { Document } from '@hocuspocus/server';

type DocumentConnection = ReturnType<Document['connections']['values']> extends IterableIterator<infer Entry> ? Entry : never;

export function overfullConnections(document: Document): DocumentConnection[] {
  throw new Error(`overfullConnections is not implemented for ${document.name}`);
}
