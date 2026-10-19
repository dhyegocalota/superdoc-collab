export type DocumentUpload = {
  uploadFiles: (files: File[]) => void;
  clear: () => void;
  message: string | null;
  isPending: boolean;
};

export function useUploadDocument(): DocumentUpload {
  throw new Error('useUploadDocument is not implemented');
}
