export type DocumentFileStorage = {
  put: (input: { documentId: string; bytes: Uint8Array }) => Promise<void>;
  read: (documentId: string) => Promise<Uint8Array>;
  remove: (documentId: string) => Promise<void>;
  pathOf: (documentId: string) => string;
};

export class InvalidDocumentIdError extends Error {
  constructor() {
    super('Invalid document id');
  }
}
