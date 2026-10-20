import { describe, expect, test } from 'vitest';
import { BOOTSTRAP_TIMEOUT_FLOOR_MS } from './constants';
import {
  BOOTSTRAP_HOST_TIMEOUT_MS,
  BOOTSTRAP_LIGHT_MAX_BYTES,
  BOOTSTRAP_MEMORY_RESERVE_MEGABYTES,
  BYTES_PER_MEGABYTE,
  bootstrapMemoryShortMessage,
  BootstrapLane,
  bootstrapLaneOf,
  bootstrapTimeoutMsOf,
  DOCUMENT_XML_STATE_BYTES_RATIO,
  isPreparable,
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

  test('a 4 GB server prepares 4 MB of text and layout and an 8 GB server 12 MB, the light lane running beside the heavy one', () => {
    expect(largestPreparableMegabytes(4096)).toBe(4);
    expect(largestPreparableMegabytes(8192)).toBe(12);
    expect(largestPreparableMegabytes(8192)).toBeGreaterThan(MAX_UPLOAD_MEGABYTES);
  });

  test('a heavy file is judged against the memory left after the light lane, a light file against all of it', () => {
    const memoryLimitMegabytes = 4096;
    const fitsAloneOnly = 5 * BYTES_PER_MEGABYTE;
    expect(isPreparable({ documentXmlBytes: fitsAloneOnly, memoryLimitMegabytes })).toBe(false);
    expect(isPreparable({ documentXmlBytes: BOOTSTRAP_LIGHT_MAX_BYTES, memoryLimitMegabytes })).toBe(true);
    expect(isPreparable({ documentXmlBytes: fitsAloneOnly, memoryLimitMegabytes: 8192 })).toBe(true);
  });

  test('a limit below the reserve prepares nothing', () => {
    expect(largestPreparableMegabytes(BOOTSTRAP_MEMORY_RESERVE_MEGABYTES - 1)).toBe(0);
  });

  test('a limit that holds no document at all has its own refusal', () => {
    expect(bootstrapMemoryShortMessage(0)).toBe('This server has too little memory to prepare documents.');
  });

  test('the host timeout outlasts the bootstrap timeout of the largest document the XML cap admits', () => {
    expect(BOOTSTRAP_HOST_TIMEOUT_MS).toBeGreaterThan(bootstrapTimeoutMsOf(MAX_DOCUMENT_XML_BYTES));
  });

  test('the refusal states the largest file in whole megabytes', () => {
    expect(bootstrapMemoryShortMessage(8)).toBe('This server can prepare documents with up to 8 MB of text and layout.');
  });

  test('the state of a document at the XML cap fits the socket message cap, so no admitted document closes with 1009', () => {
    expect(MAX_DOCUMENT_XML_BYTES * DOCUMENT_XML_STATE_BYTES_RATIO).toBeLessThanOrEqual(MAX_SOCKET_MESSAGE_BYTES);
  });
});
