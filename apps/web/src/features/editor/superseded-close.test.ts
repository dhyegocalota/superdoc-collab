import { ConnectionFailureReason, SUPERSEDED_ATTEMPT_CLOSE_CODE, SUPERSEDED_ATTEMPT_REASON } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { supersededReportOf } from './superseded-close';
import { TransportReading } from './use-connection-state';

const ABNORMAL_CLOSE_CODE = 1006;

test('a 4403 close with the superseded reason is a failed report with the Superseded reason', () => {
  expect(supersededReportOf({ code: SUPERSEDED_ATTEMPT_CLOSE_CODE, reason: SUPERSEDED_ATTEMPT_REASON })).toEqual({
    reading: TransportReading.Failed,
    failureReason: ConnectionFailureReason.Superseded,
    hasSynced: false,
  });
});

test('a 4403 close with another reason is null', () => {
  expect(supersededReportOf({ code: SUPERSEDED_ATTEMPT_CLOSE_CODE, reason: 'Forbidden' })).toBeNull();
});

test('a 1006 close is null', () => {
  expect(supersededReportOf({ code: ABNORMAL_CLOSE_CODE, reason: '' })).toBeNull();
});
