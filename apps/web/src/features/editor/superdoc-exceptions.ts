import { ConnectionFailureReason } from '@superdoc-collab/types';
import type { SuperDocExceptionPayload } from 'superdoc';

export enum SuperDocExceptionCode {
  EditRejected = 'edit-rejected',
  WorkerTransportFailed = 'worker-transport-failed',
}

export enum ExceptionOutcome {
  Logged = 'logged',
  Recoverable = 'recoverable',
  ConnectionFailed = 'connection-failed',
  Fatal = 'fatal',
}

const WARN_SEVERITY = 'warn';

const FAILURE_REASON_BY_COLLABORATION_REASON: Partial<Record<string, ConnectionFailureReason>> = {
  'access-denied': ConnectionFailureReason.AccessDenied,
  'connection-failed': ConnectionFailureReason.ConnectionFailed,
  'sync-timeout': ConnectionFailureReason.SyncTimeout,
};

function codeOf(payload: SuperDocExceptionPayload): string | undefined {
  return 'code' in payload ? payload.code : undefined;
}

export function isRecoverableException(payload: SuperDocExceptionPayload): boolean {
  return codeOf(payload) === SuperDocExceptionCode.EditRejected;
}

export function failureReasonOf(payload: SuperDocExceptionPayload): ConnectionFailureReason {
  if (codeOf(payload) === SuperDocExceptionCode.WorkerTransportFailed) return ConnectionFailureReason.WorkerTransportFailed;
  if (!('collaborationReason' in payload)) return ConnectionFailureReason.Unknown;
  const reason = FAILURE_REASON_BY_COLLABORATION_REASON[payload.collaborationReason];
  if (!reason) return ConnectionFailureReason.Unknown;
  return reason;
}

export function exceptionOutcome(payload: SuperDocExceptionPayload): ExceptionOutcome {
  const isWarnDiagnostic = 'diagnosticCode' in payload && payload.severity === WARN_SEVERITY;
  if (isWarnDiagnostic) return ExceptionOutcome.Logged;
  if (isRecoverableException(payload)) return ExceptionOutcome.Recoverable;
  const isConnectionFailure = 'collaborationReason' in payload || codeOf(payload) === SuperDocExceptionCode.WorkerTransportFailed;
  if (isConnectionFailure) return ExceptionOutcome.ConnectionFailed;
  return ExceptionOutcome.Fatal;
}
