import { DOCUMENT_XML_BYTES_CACHE_ENTRIES } from '@superdoc-collab/types';
import { LruMap } from '../limits/lru-map';

export function cachedDocumentXmlBytes(read: (documentId: string) => number): (documentId: string) => number {
  const known = new LruMap<number>({ isOverBudget: (entries) => entries.size > DOCUMENT_XML_BYTES_CACHE_ENTRIES });
  return (documentId) => {
    const cached = known.get(documentId);
    if (cached !== null) return cached;
    const documentXmlBytes = read(documentId);
    known.set({ key: documentId, value: documentXmlBytes });
    return documentXmlBytes;
  };
}
