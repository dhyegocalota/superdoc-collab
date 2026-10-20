import { describe, expect, test } from 'vitest';
import { BOOTSTRAP_TIMEOUT_FLOOR_MS } from './constants';
import {
  BOOTSTRAP_LIGHT_MAX_BYTES,
  BOOTSTRAP_MEMORY_RESERVE_MEGABYTES,
  bootstrapMemoryShortMessage,
  BootstrapLane,
  bootstrapLaneOf,
  bootstrapTimeoutMsOf,
  DOCUMENT_XML_STATE_BYTES_RATIO,
  largestPreparableMegabytes,
  MAX_DOCUMENT_XML_BYTES,
  MAX_SOCKET_MESSAGE_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MEGABYTES,
  titleSchema,
} from './documents';

describe('documents contracts', () => {
  test('trims a title and rejects a blank one', () => {
    expect(titleSchema.parse({ title: '  Plan  ' }).title).toBe('Plan');
    expect(titleSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  test('pin: a file up to the light limit is prepared in the light lane and a larger one in the heavy lane', () => {
    expect(bootstrapLaneOf(BOOTSTRAP_LIGHT_MAX_BYTES)).toBe(BootstrapLane.Light);
    expect(bootstrapLaneOf(BOOTSTRAP_LIGHT_MAX_BYTES + 1)).toBe(BootstrapLane.Heavy);
  });

  test('the bootstrap timeout is the floor plus five times the measured conversion time of the file', () => {
    expect(bootstrapTimeoutMsOf(0)).toBe(BOOTSTRAP_TIMEOUT_FLOOR_MS);
    expect(bootstrapTimeoutMsOf(MAX_UPLOAD_BYTES)).toBe(BOOTSTRAP_TIMEOUT_FLOOR_MS + 10 * 4500 * 5);
  });

  test('a 4 GB server prepares files up to 8 MB and an 8 GB server every file within the upload cap', () => {
    expect(largestPreparableMegabytes(4096)).toBe(8);
    expect(largestPreparableMegabytes(8192)).toBeGreaterThanOrEqual(MAX_UPLOAD_MEGABYTES);
  });

  test('a limit below the reserve prepares nothing', () => {
    expect(largestPreparableMegabytes(BOOTSTRAP_MEMORY_RESERVE_MEGABYTES - 1)).toBe(0);
  });

  test('the refusal states the largest file in whole megabytes', () => {
    expect(bootstrapMemoryShortMessage(8)).toBe('This server can prepare files up to 8 MB.');
  });

  test('the state of a document at the XML cap fits the socket message cap, so no admitted document closes with 1009', () => {
    expect(MAX_DOCUMENT_XML_BYTES * DOCUMENT_XML_STATE_BYTES_RATIO).toBeLessThanOrEqual(MAX_SOCKET_MESSAGE_BYTES);
  });
});
