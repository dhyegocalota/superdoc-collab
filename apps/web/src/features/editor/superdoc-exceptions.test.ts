import { ConnectionFailureReason } from '@superdoc-collab/types';
import type { SuperDocExceptionPayload } from 'superdoc';
import { describe, expect, test } from 'vitest';
import { ExceptionOutcome, exceptionOutcome, failureReasonOf, isRecoverableException, SuperDocExceptionCode } from './superdoc-exceptions';

const FATAL_CODES = [
  'collaboration-access-denied',
  'collaboration-connection-failed',
  'collaboration-sync-timeout',
  'password-required',
  'author-required',
];

function payloadWith(code: string | null): SuperDocExceptionPayload {
  const error = new Error(code === null ? 'uncoded' : code);
  if (code === null) return { error, editor: null } as SuperDocExceptionPayload;
  return { code, error, editor: null } as SuperDocExceptionPayload;
}

describe('isRecoverableException', () => {
  test('a rejected keyboard edit is recoverable', () => {
    expect(isRecoverableException(payloadWith(SuperDocExceptionCode.EditRejected))).toBe(true);
  });

  test.each(FATAL_CODES)('%s is fatal', (code) => {
    expect(isRecoverableException(payloadWith(code))).toBe(false);
  });

  test('a payload without a code is fatal', () => {
    expect(isRecoverableException(payloadWith(null))).toBe(false);
  });
});

const COLLABORATION_ROWS = [
  { collaborationReason: 'access-denied', failureReason: ConnectionFailureReason.AccessDenied },
  { collaborationReason: 'connection-failed', failureReason: ConnectionFailureReason.ConnectionFailed },
  { collaborationReason: 'sync-timeout', failureReason: ConnectionFailureReason.SyncTimeout },
];

function diagnosticWith(severity: 'warn' | 'error'): SuperDocExceptionPayload {
  return {
    diagnosticCode: 'RENDER_ERROR',
    severity,
    internalCode: 'internal-code',
    message: 'render failed',
    error: new Error('render failed'),
    diagnosticStage: 'render',
  } as SuperDocExceptionPayload;
}

function collaborationWith(collaborationReason: string): SuperDocExceptionPayload {
  const error = new Error(collaborationReason);
  return { code: `collaboration-${collaborationReason}`, collaborationReason, error, editor: null } as SuperDocExceptionPayload;
}

describe('exceptionOutcome', () => {
  test('a warn diagnostic is logged, not failed', () => {
    expect(exceptionOutcome(diagnosticWith('warn'))).toBe(ExceptionOutcome.Logged);
  });

  test('an error diagnostic is fatal', () => {
    expect(exceptionOutcome(diagnosticWith('error'))).toBe(ExceptionOutcome.Fatal);
  });

  test('edit-rejected is recoverable', () => {
    expect(exceptionOutcome(payloadWith(SuperDocExceptionCode.EditRejected))).toBe(ExceptionOutcome.Recoverable);
  });

  test.each(COLLABORATION_ROWS)('each collaboration reason is a connection failure: $collaborationReason', ({ collaborationReason }) => {
    expect(exceptionOutcome(collaborationWith(collaborationReason))).toBe(ExceptionOutcome.ConnectionFailed);
  });

  test('worker-transport-failed is a connection failure', () => {
    expect(exceptionOutcome(payloadWith(SuperDocExceptionCode.WorkerTransportFailed))).toBe(ExceptionOutcome.ConnectionFailed);
  });

  test.each(['password-required', 'author-required'])('%s stays fatal', (code) => {
    expect(exceptionOutcome(payloadWith(code))).toBe(ExceptionOutcome.Fatal);
  });
});

describe('failureReasonOf', () => {
  test.each(COLLABORATION_ROWS)('maps $collaborationReason', ({ collaborationReason, failureReason }) => {
    expect(failureReasonOf(collaborationWith(collaborationReason))).toBe(failureReason);
  });

  test('maps the worker transport code', () => {
    expect(failureReasonOf(payloadWith(SuperDocExceptionCode.WorkerTransportFailed))).toBe(ConnectionFailureReason.WorkerTransportFailed);
  });

  test('is Unknown otherwise', () => {
    expect(failureReasonOf(payloadWith(null))).toBe(ConnectionFailureReason.Unknown);
  });
});
