import type { ConnectionFailureReason, ConnectionState } from '@superdoc-collab/types';
import type { SuperDocCollaborationConnectionChangePayload } from 'superdoc';

export enum TransportReading {
  Clear = 'clear',
  Lost = 'lost',
  Reconnecting = 'reconnecting',
  Failed = 'failed',
}

export type TransportReport = { reading: TransportReading | null; failureReason: ConnectionFailureReason | null; hasSynced: boolean };

type ConnectionStateInput = { documentId: string; isCurrentUserOnline: boolean | null; membersAnsweredAt: number | null };

type ConnectionStateView = {
  state: ConnectionState;
  failureReason: ConnectionFailureReason | null;
  reportTransport: (report: TransportReport) => void;
  resetConnection: () => void;
};

export function transportReportOf(_payload: Pick<SuperDocCollaborationConnectionChangePayload, 'state' | 'kind'>): TransportReport {
  throw new Error('transportReportOf is not implemented');
}

export function mergeConnectionState(_input: { reading: TransportReading; isCurrentUserOnline: boolean | null }): ConnectionState {
  throw new Error('mergeConnectionState is not implemented');
}

export function useConnectionState(_input: ConnectionStateInput): ConnectionStateView {
  throw new Error('useConnectionState is not implemented');
}
