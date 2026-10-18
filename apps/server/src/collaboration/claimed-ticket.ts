import { CREATOR_ATTEMPT_QUERY_KEY, CREATOR_EPOCH_QUERY_KEY } from '@superdoc-collab/types';

const FIRST_ATTEMPT = 1;

export type ClaimedTicket = { attempt: number | null; epoch: string | null };

export function claimedTicketOf(searchParams: URLSearchParams): ClaimedTicket {
  const attempt = Number(searchParams.get(CREATOR_ATTEMPT_QUERY_KEY));
  const epoch = searchParams.get(CREATOR_EPOCH_QUERY_KEY);
  return {
    attempt: Number.isInteger(attempt) && attempt >= FIRST_ATTEMPT ? attempt : null,
    epoch: epoch ? epoch : null,
  };
}
