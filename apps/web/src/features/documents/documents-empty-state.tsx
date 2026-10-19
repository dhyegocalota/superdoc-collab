import type { DocumentUpload } from './use-upload-document';

export function DocumentsEmptyState(_props: { isCreating: boolean; onCreate: () => void; upload: DocumentUpload }): never {
  throw new Error('DocumentsEmptyState is not implemented');
}
