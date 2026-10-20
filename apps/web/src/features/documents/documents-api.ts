import {
  ApiPath,
  DOCX_EXTENSION,
  HttpMethod,
  HttpStatus,
  MAX_UPLOAD_BYTES,
  NOT_A_DOCX_MESSAGE,
  PREPARATION_FIELD,
  PreparationSource,
  UPLOAD_FIELD,
  UPLOAD_TOO_LARGE_MESSAGE,
  type DocumentSummary,
  type DocumentsList,
  type UploadRefusal,
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

export class UploadRefusedError extends ApiRequestError {
  readonly canPrepareOnDevice: boolean;

  constructor({ error, canPrepareOnDevice }: UploadRefusal) {
    super(error);
    this.canPrepareOnDevice = canPrepareOnDevice;
  }
}

async function refusalOf(response: Response): Promise<UploadRefusal> {
  const body = (await response.json().catch(() => null)) as Partial<UploadRefusal> | null;
  if (typeof body?.error !== 'string') return { error: UPLOAD_TOO_LARGE_MESSAGE, canPrepareOnDevice: false };
  return { error: body.error, canPrepareOnDevice: body.canPrepareOnDevice === true };
}

export async function uploadDocument({
  file,
  preparation,
  onProgress,
}: {
  file: File;
  preparation: PreparationSource;
  onProgress: (progress: UploadProgress) => void;
}): Promise<DocumentSummary> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, file);
  if (preparation === PreparationSource.Device) form.set(PREPARATION_FIELD, preparation);
  const response = await apiSendWithProgress({ path: ApiPath.Documents, method: HttpMethod.Post, body: form, onProgress });
  if (response.status === HttpStatus.PayloadTooLarge) throw new UploadRefusedError(await refusalOf(response));
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
