import {
  DOCUMENT_NOT_READY_ERROR,
  DOCUMENT_NOT_READY_MESSAGE,
  DOCUMENT_UNAVAILABLE_MESSAGE,
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  RoomMode,
  SECOND_MS,
  type DocumentMembers,
  type OpenedDocument,
  type ShareLinkRole,
  type ShareLinks,
} from '@superdoc-history/types';
import { ApiRequestError, apiGet, apiSend } from '@/lib/api';
import { DOCUMENT_FILE_QUERY_KEY, documentQueryKey } from '@/features/documents/documents-api';
import { DOCUMENT_LOAD_ERROR_MESSAGE } from './editor-copy';

export const BLANK_DOCX_PATH = '/blank.docx';
export const MEMBERS_REFRESH_MS = 5 * SECOND_MS;

export function openedDocumentQueryKey(documentId: string): unknown[] {
  return documentQueryKey({ documentId, segments: [] });
}

export function membersQueryKey(documentId: string): unknown[] {
  return documentQueryKey({ documentId, segments: [DocumentResource.Members] });
}

export function shareLinksQueryKey(documentId: string): unknown[] {
  return documentQueryKey({ documentId, segments: [DocumentResource.ShareLinks] });
}

export function documentFileQueryKey({
  documentId,
  roomMode,
}: {
  documentId: string;
  roomMode: RoomMode | undefined;
}): (string | undefined)[] {
  return [...DOCUMENT_FILE_QUERY_KEY, documentId, roomMode];
}

export async function openDocument(documentId: string): Promise<OpenedDocument> {
  const response = await apiGet(documentApiPath({ documentId }));
  if (response.status === HttpStatus.NotFound) throw new ApiRequestError(DOCUMENT_UNAVAILABLE_MESSAGE);
  if (response.status === HttpStatus.Conflict && (await response.json()).error === DOCUMENT_NOT_READY_ERROR)
    throw new ApiRequestError(DOCUMENT_NOT_READY_MESSAGE);
  if (!response.ok) throw new ApiRequestError(DOCUMENT_LOAD_ERROR_MESSAGE);
  return response.json();
}

export async function fetchDocumentFile({ documentId, roomMode }: { documentId: string; roomMode: RoomMode }): Promise<Blob> {
  const path = roomMode === RoomMode.Join ? BLANK_DOCX_PATH : documentApiPath({ documentId, resource: DocumentResource.Download });
  const response = await apiGet(path);
  if (!response.ok) throw new ApiRequestError(DOCUMENT_LOAD_ERROR_MESSAGE);
  return response.blob();
}

export class DocumentUnavailableError extends ApiRequestError {}

export async function fetchMembers(documentId: string): Promise<DocumentMembers> {
  const response = await apiGet(documentApiPath({ documentId, resource: DocumentResource.Members }));
  if (response.status === HttpStatus.NotFound) throw new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE);
  if (!response.ok) throw new ApiRequestError(`Members request failed with status ${response.status}`);
  return response.json();
}

export async function fetchShareLinks(documentId: string): Promise<ShareLinks> {
  const response = await apiGet(documentApiPath({ documentId, resource: DocumentResource.ShareLinks }));
  if (!response.ok) throw new ApiRequestError(`Share links request failed with status ${response.status}`);
  return response.json();
}

export async function rotateShareLink({ documentId, role }: { documentId: string; role: ShareLinkRole }): Promise<ShareLinks> {
  const path = `${documentApiPath({ documentId, resource: DocumentResource.ShareLinks })}/${role}/rotate`;
  const response = await apiSend({ path, method: HttpMethod.Post, body: null });
  if (!response.ok) throw new ApiRequestError(`Rotate failed with status ${response.status}`);
  return response.json();
}

export async function renameDocument({ documentId, title }: { documentId: string; title: string }): Promise<void> {
  const response = await apiSend({ path: documentApiPath({ documentId }), method: HttpMethod.Patch, body: JSON.stringify({ title }) });
  if (!response.ok) throw new ApiRequestError(`Rename failed with status ${response.status}`);
}

export async function deleteDocument(documentId: string): Promise<void> {
  const response = await apiSend({ path: documentApiPath({ documentId }), method: HttpMethod.Delete, body: null });
  if (!response.ok) throw new ApiRequestError(`Delete failed with status ${response.status}`);
}
