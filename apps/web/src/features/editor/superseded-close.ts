import { ConnectionFailureReason, SUPERSEDED_ATTEMPT_CLOSE_CODE, SUPERSEDED_ATTEMPT_REASON } from '@superdoc-collab/types';
import { TransportReading, type TransportReport } from './use-connection-state';

export type CloseEvent = { code: number; reason: string };

const SUPERSEDED_REPORT: TransportReport = {
  reading: TransportReading.Failed,
  failureReason: ConnectionFailureReason.Superseded,
  hasSynced: false,
};

export function supersededReportOf({ code, reason }: CloseEvent): TransportReport | null {
  const isSupersededClose = code === SUPERSEDED_ATTEMPT_CLOSE_CODE && reason === SUPERSEDED_ATTEMPT_REASON;
  if (!isSupersededClose) return null;
  return SUPERSEDED_REPORT;
}
