export function cachedDocumentXmlBytes(read: (documentId: string) => number): (documentId: string) => number {
  return read;
}
