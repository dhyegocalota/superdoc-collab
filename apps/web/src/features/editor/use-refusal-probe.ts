import { ConnectionFailureReason } from '@superdoc-collab/types';
import { useQuery } from '@tanstack/react-query';
import { AuthenticationError, ServerBusyError } from '@/lib/api';
import { openDocument, openedDocumentQueryKey } from './editor-api';

const REFUSAL_PROBE_SEGMENT = 'refusal-probe';

export type Refusal = { failureReason: ConnectionFailureReason | null; failureMessage: string | null };

export function useRefusalProbe({
  documentId,
  failureReason,
}: {
  documentId: string;
  failureReason: ConnectionFailureReason | null;
}): Refusal {
  const isDenied = failureReason === ConnectionFailureReason.AccessDenied;
  const probe = useQuery({
    queryKey: [...openedDocumentQueryKey(documentId), REFUSAL_PROBE_SEGMENT],
    queryFn: () => openDocument(documentId),
    enabled: isDenied,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    gcTime: 0,
    staleTime: 0,
  });
  if (!isDenied) return { failureReason, failureMessage: null };
  if (probe.isPending) return { failureReason: null, failureMessage: null };
  if (probe.error instanceof ServerBusyError) {
    return { failureReason: ConnectionFailureReason.HeavyRoomsFull, failureMessage: probe.error.message };
  }
  if (probe.error instanceof AuthenticationError) return { failureReason: ConnectionFailureReason.SessionEnded, failureMessage: null };
  return { failureReason, failureMessage: null };
}
