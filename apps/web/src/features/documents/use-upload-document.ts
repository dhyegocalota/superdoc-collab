import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentPagePath, PreparationSource } from '@superdoc-collab/types';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDeviceRefusal, type DeviceRefusal } from '@/features/local-preview/device-guard';
import { keepLocalFile } from '@/features/local-preview/local-file-store';
import type { UploadProgress } from '@/lib/api';
import { DOCUMENTS_QUERY_KEY, UploadRefusedError, uploadDocument, validateUpload } from './documents-api';
import { ONE_FILE_AT_A_TIME_MESSAGE } from './documents-copy';

export type DevicePreparation = { refusal: DeviceRefusal | null; start: () => void };

export type DocumentUpload = {
  progress: UploadProgress | null;
  uploadFiles: (files: File[]) => void;
  clear: () => void;
  message: string | null;
  isPending: boolean;
  devicePreparation: DevicePreparation | null;
};

type UseUploadDocumentOptions = { onUploaded?: () => void };

function uploadErrorMessage({ rejectionMessage, error }: { rejectionMessage: string | null; error: Error | null }): string | null {
  if (rejectionMessage !== null) return rejectionMessage;
  if (error === null) return null;
  return error.message;
}

export function useUploadDocument({ onUploaded }: UseUploadDocumentOptions = {}): DocumentUpload {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const deviceRefusal = useDeviceRefusal();
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const { mutate, error, variables, reset, isPending } = useMutation({
    mutationFn: ({ file, preparation }: { file: File; preparation: PreparationSource }) =>
      uploadDocument({ file, preparation, onProgress: setProgress }),
    onSuccess: async (document, { file }) => {
      keepLocalFile({ documentId: document.id, file });
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      onUploaded?.();
      await navigate(documentPagePath(document.id));
    },
    onSettled: () => setProgress(null),
  });
  const isDeviceOffered = error instanceof UploadRefusedError && error.canPrepareOnDevice && variables !== undefined;

  function uploadFiles(files: File[]): void {
    const [file] = files;
    if (!file) return;
    reset();
    const nextRejectionMessage = files.length > 1 ? ONE_FILE_AT_A_TIME_MESSAGE : validateUpload(file);
    setRejectionMessage(nextRejectionMessage);
    if (nextRejectionMessage !== null) return;
    mutate({ file, preparation: PreparationSource.Server });
  }

  function clear(): void {
    setRejectionMessage(null);
    reset();
  }

  function prepareOnDevice(): void {
    if (variables === undefined) return;
    reset();
    mutate({ file: variables.file, preparation: PreparationSource.Device });
  }

  return {
    progress,
    uploadFiles,
    clear,
    message: uploadErrorMessage({ rejectionMessage, error }),
    isPending,
    devicePreparation: isDeviceOffered ? { refusal: deviceRefusal, start: prepareOnDevice } : null,
  };
}
