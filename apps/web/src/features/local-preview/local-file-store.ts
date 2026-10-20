export function keepLocalFile({ documentId, file }: { documentId: string; file: File }): void {}

export function localFileOf(documentId: string): File | null {
  return null;
}

export function discardLocalFile(documentId: string): void {}
