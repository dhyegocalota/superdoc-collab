import { CREATOR_ATTEMPT_QUERY_KEY, CREATOR_EPOCH_QUERY_KEY, type OpenedDocument } from '@superdoc-collab/types';

export const HOCUSPOCUS_PROVIDER = 'hocuspocus';
const HTTP_SCHEME = /^http/;

export type CreatorTicket = { attempt: number; epoch: string };

export function creatorTicketOf({
  creatorAttempt,
  creatorEpoch,
}: Pick<OpenedDocument, 'creatorAttempt' | 'creatorEpoch'>): CreatorTicket | null {
  if (creatorAttempt === null || creatorEpoch === null) return null;
  return { attempt: creatorAttempt, epoch: creatorEpoch };
}

export function collaborationUrl({ path, creatorTicket }: { path: string; creatorTicket?: CreatorTicket | null }): string {
  const url = `${window.location.origin.replace(HTTP_SCHEME, 'ws')}${path}`;
  if (!creatorTicket) return url;
  const query = new URLSearchParams({
    [CREATOR_ATTEMPT_QUERY_KEY]: String(creatorTicket.attempt),
    [CREATOR_EPOCH_QUERY_KEY]: creatorTicket.epoch,
  });
  return `${url}?${query}`;
}
