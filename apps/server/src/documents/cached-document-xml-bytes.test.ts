import { DOCUMENT_XML_BYTES_CACHE_ENTRIES } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { cachedDocumentXmlBytes } from './cached-document-xml-bytes';

const SIZE_BYTES = 9_000_000;

test('the stored file of a document is read once, however many times its size is asked', () => {
  const read = vi.fn(() => SIZE_BYTES);
  const documentXmlBytesOf = cachedDocumentXmlBytes(read);
  expect([documentXmlBytesOf('plan'), documentXmlBytesOf('plan'), documentXmlBytesOf('plan')]).toEqual([
    SIZE_BYTES,
    SIZE_BYTES,
    SIZE_BYTES,
  ]);
  expect(read).toHaveBeenCalledTimes(1);
});

test('each document is read on its own, and the oldest sizes leave once the cache is full', () => {
  const read = vi.fn((documentId: string) => documentId.length);
  const documentXmlBytesOf = cachedDocumentXmlBytes(read);
  documentXmlBytesOf('a');
  documentXmlBytesOf('bb');
  expect(read).toHaveBeenCalledTimes(2);
  Array.from({ length: DOCUMENT_XML_BYTES_CACHE_ENTRIES }, (_, index) => `filler-${index}`).forEach(documentXmlBytesOf);
  documentXmlBytesOf('a');
  expect(read).toHaveBeenCalledTimes(DOCUMENT_XML_BYTES_CACHE_ENTRIES + 3);
});
