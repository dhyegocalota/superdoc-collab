type KeptFile = { documentId: string; file: File };

let kept: KeptFile | null = null;

export function keepLocalFile({ documentId, file }: KeptFile): void {
  kept = { documentId, file };
}

export function localFileOf(documentId: string): File | null {
  if (kept === null || kept.documentId !== documentId) return null;
  return kept.file;
}

export function discardLocalFile(documentId: string): void {
  if (kept === null || kept.documentId !== documentId) return;
  kept = null;
}
