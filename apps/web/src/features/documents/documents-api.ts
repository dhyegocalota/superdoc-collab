import {
  ApiPath,
  DOCX_EXTENSION,
  HttpMethod,
  HttpStatus,
  MAX_UPLOAD_BYTES,
  NOT_A_DOCX_MESSAGE,
  UPLOAD_FIELD,
  UPLOAD_TOO_LARGE_MESSAGE,
  type DocumentSummary,
} from '@superdoc-history/types';
import { ApiRequestError, apiSend } from '@/lib/api';
import { CREATE_FAILED_MESSAGE, UPLOAD_FAILED_MESSAGE } from './documents-copy';

export const DOCUMENTS_QUERY_KEY = ['documents'];
export const DOCUMENT_FILE_QUERY_KEY = ['document-file'];

export function documentQueryKey({ documentId, segments }: { documentId: string; segments: unknown[] }): unknown[] {
  return [...DOCUMENTS_QUERY_KEY, documentId, ...segments];
}

export function validateUpload(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(DOCX_EXTENSION)) return NOT_A_DOCX_MESSAGE;
  if (file.size > MAX_UPLOAD_BYTES) return UPLOAD_TOO_LARGE_MESSAGE;
  return null;
}

export async function uploadDocument(file: File): Promise<DocumentSummary> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, file);
  const response = await apiSend({ path: ApiPath.Documents, method: HttpMethod.Post, body: form });
  if (response.status === HttpStatus.PayloadTooLarge) throw new ApiRequestError(UPLOAD_TOO_LARGE_MESSAGE);
  if (response.status === HttpStatus.UnsupportedMediaType) throw new ApiRequestError(NOT_A_DOCX_MESSAGE);
  if (!response.ok) throw new ApiRequestError(`${UPLOAD_FAILED_MESSAGE} ${response.status}`);
  return response.json();
}

export async function createBlankDocument(title: string): Promise<DocumentSummary> {
  const response = await apiSend({ path: ApiPath.Documents, method: HttpMethod.Post, body: JSON.stringify({ title }) });
  if (!response.ok) throw new ApiRequestError(`${CREATE_FAILED_MESSAGE} ${response.status}`);
  return response.json();
}
