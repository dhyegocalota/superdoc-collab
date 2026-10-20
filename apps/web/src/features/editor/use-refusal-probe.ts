import type { ConnectionFailureReason } from '@superdoc-collab/types';

export type Refusal = { failureReason: ConnectionFailureReason | null; failureMessage: string | null };

export function useRefusalProbe({ failureReason }: { documentId: string; failureReason: ConnectionFailureReason | null }): Refusal {
  return { failureReason, failureMessage: null };
}
