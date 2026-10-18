import {
  CREATOR_ATTEMPT_QUERY_KEY,
  CREATOR_EPOCH_QUERY_KEY,
  type CreatorTicket,
  type OpenedDocument,
  TAB_QUERY_KEY,
} from '@superdoc-collab/types';
import { tabId } from '@/lib/tab-id';

export const HOCUSPOCUS_PROVIDER = 'hocuspocus';
const HTTP_SCHEME = /^http/;

export function creatorTicketOf({
  creatorAttempt,
  creatorEpoch,
}: Pick<OpenedDocument, 'creatorAttempt' | 'creatorEpoch'>): CreatorTicket | null {
  if (creatorAttempt === null || creatorEpoch === null) return null;
  return { attempt: creatorAttempt, epoch: creatorEpoch };
}

export function collaborationUrl({ path, creatorTicket }: { path: string; creatorTicket: CreatorTicket | null }): string {
  const url = `${window.location.origin.replace(HTTP_SCHEME, 'ws')}${path}`;
  const query = new URLSearchParams({ [TAB_QUERY_KEY]: tabId() });
  if (creatorTicket !== null) {
    query.set(CREATOR_ATTEMPT_QUERY_KEY, String(creatorTicket.attempt));
    query.set(CREATOR_EPOCH_QUERY_KEY, creatorTicket.epoch);
  }
  return `${url}?${query}`;
}
