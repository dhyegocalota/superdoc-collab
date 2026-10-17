import type { SuperDocExceptionPayload } from 'superdoc';
import { describe, expect, test } from 'vitest';
import { isRecoverableException, SuperDocExceptionCode } from './superdoc-exceptions';

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
