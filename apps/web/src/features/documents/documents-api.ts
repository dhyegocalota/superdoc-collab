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
  type DocumentsList,
} from '@superdoc-collab/types';
import { ApiRequestError, apiGet, apiSend, apiSendWithProgress, readJson, type UploadProgress } from '@/lib/api';
import { CREATE_SUBJECT, LIST_SUBJECT, UPLOAD_SUBJECT } from './documents-copy';

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

async function refusalMessageOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (typeof body?.error !== 'string') return UPLOAD_TOO_LARGE_MESSAGE;
  return body.error;
}

export async function uploadDocument({
  file,
  onProgress,
}: {
  file: File;
  onProgress: (progress: UploadProgress) => void;
}): Promise<DocumentSummary> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, file);
  const response = await apiSendWithProgress({ path: ApiPath.Documents, method: HttpMethod.Post, body: form, onProgress });
  if (response.status === HttpStatus.PayloadTooLarge) throw new ApiRequestError(await refusalMessageOf(response));
  if (response.status === HttpStatus.UnsupportedMediaType) throw new ApiRequestError(NOT_A_DOCX_MESSAGE);
  return readJson<DocumentSummary>({ response, subject: UPLOAD_SUBJECT });
}

export async function createBlankDocument(title: string): Promise<DocumentSummary> {
  const response = await apiSend({ path: ApiPath.Documents, method: HttpMethod.Post, body: JSON.stringify({ title }) });
  return readJson<DocumentSummary>({ response, subject: CREATE_SUBJECT });
}

export async function fetchDocuments(): Promise<DocumentsList> {
  const response = await apiGet(ApiPath.Documents);
  return readJson<DocumentsList>({ response, subject: LIST_SUBJECT });
}
