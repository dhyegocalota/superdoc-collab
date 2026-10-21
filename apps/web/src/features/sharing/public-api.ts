import {
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  publicApiPath,
  publicSummaryApiPath,
  type PublicFlag,
  type PublicOpened,
  type PublicSummary,
} from '@superdoc-collab/types';
import { ApiRequestError, apiGet, apiSend, DocumentUnavailableError, readJson, refusalMessageOf, ServerBusyError } from '@/lib/api';
import { documentQueryKey } from '@/features/documents/documents-api';
import {
  PUBLIC_FLAG_SUBJECT,
  PUBLIC_LOAD_FAILED_MESSAGE,
  PUBLIC_OPEN_SUBJECT,
  PUBLIC_SUMMARY_SUBJECT,
  PUBLIC_UNAVAILABLE_MESSAGE,
} from './public-copy';

const PUBLIC_QUERY_KEY = ['public'];

export class PublicRateLimitedError extends ApiRequestError {}

export function publicFlagQueryKey(documentId: string): unknown[] {
  return documentQueryKey({ documentId, segments: [DocumentResource.Public] });
}

export function publicOpenedQueryKey(documentId: string): unknown[] {
  return [...PUBLIC_QUERY_KEY, documentId];
}

export function publicSummaryQueryKey(documentId: string): unknown[] {
  return [...PUBLIC_QUERY_KEY, documentId, DocumentResource.Summaries];
}

export async function fetchPublicFlag(documentId: string): Promise<PublicFlag> {
  const response = await apiGet(documentApiPath({ documentId, resource: DocumentResource.Public }));
  return readJson<PublicFlag>({ response, subject: PUBLIC_FLAG_SUBJECT });
}

export async function switchPublicFlag({ documentId, isPublic }: { documentId: string; isPublic: boolean }): Promise<PublicFlag> {
  const path = documentApiPath({ documentId, resource: DocumentResource.Public });
  const response = await apiSend({ path, method: HttpMethod.Put, body: JSON.stringify({ isPublic }) });
  return readJson<PublicFlag>({ response, subject: PUBLIC_FLAG_SUBJECT });
}

export async function fetchPublicOpened(documentId: string): Promise<PublicOpened> {
  const response = await apiGet(publicApiPath(documentId));
  if (response.status === HttpStatus.NotFound) throw new DocumentUnavailableError(PUBLIC_UNAVAILABLE_MESSAGE);
  if (response.status === HttpStatus.TooManyRequests) {
    throw new PublicRateLimitedError(await refusalMessageOf({ response, fallback: PUBLIC_LOAD_FAILED_MESSAGE }));
  }
  if (response.status === HttpStatus.ServiceUnavailable) {
    throw new ServerBusyError(await refusalMessageOf({ response, fallback: PUBLIC_LOAD_FAILED_MESSAGE }));
  }
  return readJson<PublicOpened>({ response, subject: PUBLIC_OPEN_SUBJECT });
}

export async function fetchPublicSummary(documentId: string): Promise<PublicSummary> {
  const response = await apiGet(publicSummaryApiPath(documentId));
  return readJson<PublicSummary>({ response, subject: PUBLIC_SUMMARY_SUBJECT });
}
