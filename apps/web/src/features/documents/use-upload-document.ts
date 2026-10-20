import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentPagePath } from '@superdoc-collab/types';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { type DeviceRefusal } from '@/features/local-preview/device-guard';
import type { UploadProgress } from '@/lib/api';
import { DOCUMENTS_QUERY_KEY, uploadDocument, validateUpload } from './documents-api';
import { ONE_FILE_AT_A_TIME_MESSAGE } from './documents-copy';

export type DocumentUpload = {
  progress: UploadProgress | null;
  uploadFiles: (files: File[]) => void;
  clear: () => void;
  message: string | null;
  isPending: boolean;
  devicePreparation: DevicePreparation | null;
};

export type DevicePreparation = { refusal: DeviceRefusal | null; start: () => void };

type UseUploadDocumentOptions = { onUploaded?: () => void };

function uploadErrorMessage({ rejectionMessage, error }: { rejectionMessage: string | null; error: Error | null }): string | null {
  if (rejectionMessage !== null) return rejectionMessage;
  if (error === null) return null;
  return error.message;
}

export function useUploadDocument({ onUploaded }: UseUploadDocumentOptions = {}): DocumentUpload {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const { mutate, error, reset, isPending } = useMutation({
    mutationFn: (file: File) => uploadDocument({ file, onProgress: setProgress }),
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      onUploaded?.();
      await navigate(documentPagePath(document.id));
    },
    onSettled: () => setProgress(null),
  });

  function uploadFiles(files: File[]): void {
    const [file] = files;
    if (!file) return;
    reset();
    const nextRejectionMessage = files.length > 1 ? ONE_FILE_AT_A_TIME_MESSAGE : validateUpload(file);
    setRejectionMessage(nextRejectionMessage);
    if (nextRejectionMessage !== null) return;
    mutate(file);
  }

  function clear(): void {
    setRejectionMessage(null);
    reset();
  }

  return { progress, uploadFiles, clear, message: uploadErrorMessage({ rejectionMessage, error }), isPending, devicePreparation: null };
}
