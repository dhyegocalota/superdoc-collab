import type { ConnectionFailureReason } from '@superdoc-collab/types';
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

export function isRecoverableException(payload: SuperDocExceptionPayload): boolean {
  const code = 'code' in payload ? payload.code : null;
  return code === SuperDocExceptionCode.EditRejected;
}

export function exceptionOutcome(_payload: SuperDocExceptionPayload): ExceptionOutcome {
  throw new Error('exceptionOutcome is not implemented');
}

export function failureReasonOf(_payload: SuperDocExceptionPayload): ConnectionFailureReason {
  throw new Error('failureReasonOf is not implemented');
}
