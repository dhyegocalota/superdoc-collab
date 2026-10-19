import {
  BootstrapStage,
  DOCUMENT_READY_GIVE_UP_MS,
  DOCUMENT_READY_POLL_MS,
  PREPARING_POLL_MS,
  type BootstrapProgress,
  type OpenedDocument,
} from '@superdoc-collab/types';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DocumentUnavailableError } from '@/lib/api';
import { DocumentNotReadyError, openDocument, openedDocumentQueryKey } from './editor-api';

const GIVE_UP_POLL_COUNT = DOCUMENT_READY_GIVE_UP_MS / DOCUMENT_READY_POLL_MS;

export enum DocumentReadiness {
  Opening = 'opening',
  Ready = 'ready',
  Waiting = 'waiting',
  Paused = 'paused',
  Failed = 'failed',
  Unavailable = 'unavailable',
}

const READINESS_BY_STAGE: Record<BootstrapStage, DocumentReadiness> = {
  [BootstrapStage.Queued]: DocumentReadiness.Waiting,
  [BootstrapStage.Preparing]: DocumentReadiness.Waiting,
  [BootstrapStage.Ready]: DocumentReadiness.Ready,
  [BootstrapStage.Failed]: DocumentReadiness.Failed,
};

type ReadinessInput = { data: OpenedDocument | undefined; error: Error | null; errorCount: number; resumedAt: number };

function readinessOf({ data, error, errorCount, resumedAt }: ReadinessInput): DocumentReadiness {
  if (data) return READINESS_BY_STAGE[data.bootstrap.stage];
  if (!error) return DocumentReadiness.Opening;
  if (error instanceof DocumentUnavailableError) return DocumentReadiness.Unavailable;
  if (!(error instanceof DocumentNotReadyError)) return DocumentReadiness.Failed;
  const hasGivenUp = errorCount - resumedAt >= GIVE_UP_POLL_COUNT;
  if (hasGivenUp) return DocumentReadiness.Paused;
  return DocumentReadiness.Waiting;
}

function pollIntervalOf(data: OpenedDocument | undefined): number {
  if (data?.bootstrap.stage === BootstrapStage.Preparing) return PREPARING_POLL_MS;
  return DOCUMENT_READY_POLL_MS;
}

function bootstrapOf(data: OpenedDocument | undefined): BootstrapProgress | null {
  if (!data) return null;
  return data.bootstrap;
}

function openedDocumentQueryOptions(documentId: string) {
  return queryOptions({
    queryKey: openedDocumentQueryKey(documentId),
    queryFn: () => openDocument(documentId),
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
  });
}

function useOpenedDocumentQuery({ documentId, shouldPoll }: { documentId: string; shouldPoll: boolean }) {
  const queryClient = useQueryClient();
  const [resume, setResume] = useState({ documentId, errorCount: 0 });
  const resumedAt = resume.documentId === documentId ? resume.errorCount : 0;
  const query = useQuery({
    ...openedDocumentQueryOptions(documentId),
    refetchOnMount: 'always',
    refetchInterval: (current) => {
      const { data, error, errorUpdateCount } = current.state;
      const readiness = readinessOf({ data, error, errorCount: errorUpdateCount, resumedAt });
      const isWaiting = readiness === DocumentReadiness.Waiting;
      return isWaiting && shouldPoll ? pollIntervalOf(data) : false;
    },
  });
  const readiness = readinessOf({ data: query.data, error: query.error, errorCount: query.errorUpdateCount, resumedAt });
  const isNotReady = readiness === DocumentReadiness.Waiting || readiness === DocumentReadiness.Paused;

  function keepWaiting(): void {
    setResume({ documentId, errorCount: query.errorUpdateCount });
    void query.refetch();
  }

  function restartWaiting(): void {
    queryClient.removeQueries({ queryKey: openedDocumentQueryKey(documentId), exact: true });
    setResume({ documentId, errorCount: 0 });
  }

  function retry(): void {
    void query.refetch();
  }

  return {
    data: readiness === DocumentReadiness.Ready ? query.data : undefined,
    error: isNotReady ? null : query.error,
    isFetchedAfterMount: query.isFetchedAfterMount,
    bootstrap: bootstrapOf(query.data),
    readiness,
    keepWaiting,
    restartWaiting,
    retry,
  };
}

export function useOpenedDocument(documentId: string) {
  return useOpenedDocumentQuery({ documentId, shouldPoll: true });
}

export function useOpenedDocumentWithoutPolling(documentId: string) {
  return useOpenedDocumentQuery({ documentId, shouldPoll: false });
}
