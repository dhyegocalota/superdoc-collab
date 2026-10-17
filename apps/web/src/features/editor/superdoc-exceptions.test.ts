import { describe, expect, test } from 'vitest';
import { isRecoverableException, SuperDocExceptionCode } from './superdoc-exceptions';

const REJECTED_EDIT = { code: SuperDocExceptionCode.EditRejected, error: new Error('This edit could not be completed.') };
const ACCESS_DENIED = { code: 'collaboration-access-denied', error: new Error('denied') };
const UNCODED = { error: new Error('boom') };

describe('isRecoverableException', () => {
  test('a rejected keyboard edit is recoverable', () => {
    expect(isRecoverableException(REJECTED_EDIT)).toBe(true);
  });

  test('any other code is fatal', () => {
    expect(isRecoverableException(ACCESS_DENIED)).toBe(false);
  });

  test('a payload without a code is fatal', () => {
    expect(isRecoverableException(UNCODED)).toBe(false);
  });
});
