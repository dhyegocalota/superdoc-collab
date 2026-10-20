import {
  DOCUMENT_UNAVAILABLE_MESSAGE,
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  memberApiPath,
  RoomMode,
  TAB_QUERY_KEY,
  thumbnailApiPath,
  type BootstrapProgress,
  type DocumentMembers,
  type OpenedDocument,
  type ShareLinkRole,
  type ShareLinks,
} from '@superdoc-collab/types';
import { ApiRequestError, apiGet, DocumentUnavailableError, apiSend, assertDocumentAvailable, assertOk, readJson } from '@/lib/api';
import { DOCUMENT_FILE_QUERY_KEY, documentQueryKey } from '@/features/documents/documents-api';
import { tabId } from '@/lib/tab-id';
import type { BootstrapReading, OpenedAnswer } from './bootstrap-reading';
import { DOCUMENT_LOAD_ERROR_MESSAGE } from './editor-copy';

export const BLANK_DOCX_PATH = '/blank.docx';

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

function bootstrapReadingOf(bootstrap: BootstrapProgress): BootstrapReading {
  const preparingSince = 'preparingSince' in bootstrap ? (bootstrap.preparingSince as number | null) : null;
  const fileBytes = 'fileBytes' in bootstrap ? (bootstrap.fileBytes as number | null) : null;
  return { ...bootstrap, preparingSince, fileBytes };
}

export async function openDocument(documentId: string): Promise<OpenedAnswer> {
  const response = await apiGet(documentApiPath({ documentId }));
  const isUnavailable = response.status === HttpStatus.NotFound || response.status === HttpStatus.Forbidden;
  if (isUnavailable) throw new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE);
  if (!response.ok) throw new ApiRequestError(DOCUMENT_LOAD_ERROR_MESSAGE);
  const opened: OpenedDocument = await response.json();
  const { bootstrap } = opened;
  return {
    ...opened,
    bootstrap: bootstrapReadingOf(bootstrap),
  };
}

export async function fetchDocumentFile({ documentId, roomMode }: { documentId: string; roomMode: RoomMode }): Promise<Blob> {
  const path = roomMode === RoomMode.Join ? BLANK_DOCX_PATH : documentApiPath({ documentId, resource: DocumentResource.Download });
  const response = await apiGet(path);
  if (!response.ok) throw new ApiRequestError(DOCUMENT_LOAD_ERROR_MESSAGE);
  return response.blob();
}

export async function fetchMembers(documentId: string): Promise<DocumentMembers> {
  const query = new URLSearchParams({ [TAB_QUERY_KEY]: tabId() });
  const response = await apiGet(`${documentApiPath({ documentId, resource: DocumentResource.Members })}?${query}`);
  assertDocumentAvailable(response);
  return readJson<DocumentMembers>({ response, subject: 'Members request' });
}

export async function fetchShareLinks(documentId: string): Promise<ShareLinks> {
  const response = await apiGet(documentApiPath({ documentId, resource: DocumentResource.ShareLinks }));
  return readJson<ShareLinks>({ response, subject: 'Share links request' });
}

export async function rotateShareLink({ documentId, role }: { documentId: string; role: ShareLinkRole }): Promise<ShareLinks> {
  const path = `${documentApiPath({ documentId, resource: DocumentResource.ShareLinks })}/${role}/rotate`;
  const response = await apiSend({ path, method: HttpMethod.Post, body: null });
  return readJson<ShareLinks>({ response, subject: 'Rotate' });
}

export async function revokeMember({ documentId, userId }: { documentId: string; userId: string }): Promise<void> {
  const response = await apiSend({ path: memberApiPath({ documentId, userId }), method: HttpMethod.Delete, body: null });
  assertOk({ response, subject: 'Remove member' });
}

export async function renameDocument({ documentId, title }: { documentId: string; title: string }): Promise<void> {
  const response = await apiSend({ path: documentApiPath({ documentId }), method: HttpMethod.Patch, body: JSON.stringify({ title }) });
  assertOk({ response, subject: 'Rename' });
}

export async function deleteDocument(documentId: string): Promise<void> {
  const response = await apiSend({ path: documentApiPath({ documentId }), method: HttpMethod.Delete, body: null });
  assertOk({ response, subject: 'Delete' });
}

export async function uploadThumbnail({ documentId, blob }: { documentId: string; blob: Blob }): Promise<boolean> {
  const response = await apiSend({ path: thumbnailApiPath({ documentId }), method: HttpMethod.Put, body: blob });
  return response.ok;
}

export function sendThumbnailBeacon({ documentId, blob }: { documentId: string; blob: Blob }): boolean {
  return navigator.sendBeacon(thumbnailApiPath({ documentId }), blob);
}
