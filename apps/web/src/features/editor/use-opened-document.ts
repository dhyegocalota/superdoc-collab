import {
  type BootstrapProgress,
  BootstrapStage,
  DOCUMENT_READY_POLL_MS,
  type OpenedDocument,
  PREPARING_POLL_MS,
} from '@superdoc-collab/types';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DocumentUnavailableError } from '@/lib/api';
import { openDocument, openedDocumentQueryKey } from './editor-api';

export enum DocumentReadiness {
  Opening = 'opening',
  Ready = 'ready',
  Waiting = 'waiting',
  Failed = 'failed',
  Unavailable = 'unavailable',
}

const READINESS_BY_STAGE: Record<BootstrapStage, DocumentReadiness> = {
  [BootstrapStage.Queued]: DocumentReadiness.Waiting,
  [BootstrapStage.Preparing]: DocumentReadiness.Waiting,
  [BootstrapStage.Ready]: DocumentReadiness.Ready,
  [BootstrapStage.Failed]: DocumentReadiness.Failed,
};

type ReadinessInput = { data: OpenedDocument | undefined; error: Error | null };

function readinessOf({ data, error }: ReadinessInput): DocumentReadiness {
  if (data) return READINESS_BY_STAGE[data.bootstrap.stage];
  if (!error) return DocumentReadiness.Opening;
  if (error instanceof DocumentUnavailableError) return DocumentReadiness.Unavailable;
  return DocumentReadiness.Failed;
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
  const query = useQuery({
    ...openedDocumentQueryOptions(documentId),
    refetchOnMount: 'always',
    refetchInterval: (current) => {
      const { data, error } = current.state;
      const readiness = readinessOf({ data, error });
      const isWaiting = readiness === DocumentReadiness.Waiting;
      return isWaiting && shouldPoll ? pollIntervalOf(data) : false;
    },
  });
  const readiness = readinessOf({ data: query.data, error: query.error });

  function retry(): void {
    void query.refetch();
  }

  return {
    data: readiness === DocumentReadiness.Ready ? query.data : undefined,
    error: query.error,
    isFetchedAfterMount: query.isFetchedAfterMount,
    bootstrap: bootstrapOf(query.data),
    readiness,
    retry,
  };
}

export function useOpenedDocument(documentId: string) {
  return useOpenedDocumentQuery({ documentId, shouldPoll: true });
}

export function useOpenedDocumentWithoutPolling(documentId: string) {
  return useOpenedDocumentQuery({ documentId, shouldPoll: false });
}
