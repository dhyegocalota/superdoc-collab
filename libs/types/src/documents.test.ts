import { describe, expect, test } from 'vitest';
import { BOOTSTRAP_STATE_BYTES_RATIO, BOOTSTRAP_TIMEOUT_FLOOR_MS, MINUTE_MS } from './constants';
import {
  BOOTSTRAP_HOST_TIMEOUT_MS,
  BOOTSTRAP_LIGHT_MAX_BYTES,
  BOOTSTRAP_MEMORY_RESERVE_MEGABYTES,
  BYTES_PER_MEGABYTE,
  bootstrapBusyMessage,
  bootstrapMemoryShortMessage,
  BootstrapLane,
  bootstrapLaneOf,
  bootstrapTimeoutMsOf,
  isHeavyRoomDocument,
  isPreparable,
  largestPreparableMegabytes,
  LARGE_ROOM_STATE_BYTES,
  MAX_DOCUMENT_XML_BYTES,
  largestHoldableMegabytes,
  roomHeapBudgetMegabytes,
  roomHoldShortMessage,
  roomHeapMegabytesOf,
  SERVER_HEAP_BASELINE_MEGABYTES,
  ROOM_LOAD_SPIKE_HEAP_MEGABYTES,
  BOOTSTRAP_CONVERSION_RESIDENT_MEGABYTES,
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
    expect(MAX_DOCUMENT_XML_BYTES * BOOTSTRAP_STATE_BYTES_RATIO).toBeLessThanOrEqual(MAX_SOCKET_MESSAGE_BYTES);
  });

  test('pin: the room heap budget is the smaller of what the container and the server heap leave after the reserve, a conversion and a hand-off', () => {
    const serverHeapMegabytes = 3276;
    const heapLeft = serverHeapMegabytes - SERVER_HEAP_BASELINE_MEGABYTES - ROOM_LOAD_SPIKE_HEAP_MEGABYTES;
    const containerLeft = 8192 - BOOTSTRAP_MEMORY_RESERVE_MEGABYTES - BOOTSTRAP_CONVERSION_RESIDENT_MEGABYTES;
    expect(roomHeapBudgetMegabytes({ memoryLimitMegabytes: 8192, serverHeapMegabytes })).toBe(Math.min(heapLeft, containerLeft));
    expect(roomHeapBudgetMegabytes({ memoryLimitMegabytes: 8192, serverHeapMegabytes })).toBe(heapLeft);
    expect(roomHeapBudgetMegabytes({ memoryLimitMegabytes: 8192, serverHeapMegabytes: null })).toBe(containerLeft);
    expect(roomHeapBudgetMegabytes({ memoryLimitMegabytes: null, serverHeapMegabytes })).toBe(heapLeft);
    expect(roomHeapBudgetMegabytes({ memoryLimitMegabytes: null, serverHeapMegabytes: null })).toBeNull();
    expect(roomHeapBudgetMegabytes({ memoryLimitMegabytes: 1024, serverHeapMegabytes: 400 })).toBe(0);
  });

  test('the largest document a room heap budget can hold is read off its heavy share', () => {
    expect(largestHoldableMegabytes(638)).toBe(6);
    expect(largestHoldableMegabytes(1457)).toBe(14);
    expect(largestHoldableMegabytes(0)).toBe(0);
  });

  test('a server with a heap for no heavy room says so, otherwise it names the largest size', () => {
    expect(roomHoldShortMessage(0)).toContain('no memory');
    expect(roomHoldShortMessage(6)).toContain('6 MB');
  });

  test('pin: a room costs 19 bytes of heap for every byte of its state', () => {
    expect(roomHeapMegabytesOf(BYTES_PER_MEGABYTE)).toBe(19);
  });

  test('pin: a document is heavy when its state would exceed the large room limit', () => {
    const largestLightXmlBytes = LARGE_ROOM_STATE_BYTES / BOOTSTRAP_STATE_BYTES_RATIO;
    expect(isHeavyRoomDocument(largestLightXmlBytes)).toBe(false);
    expect(isHeavyRoomDocument(largestLightXmlBytes + 1)).toBe(true);
  });

  test('pin: the busy message names the wait in whole minutes, at least one', () => {
    expect(bootstrapBusyMessage(4 * MINUTE_MS - 1)).toBe('The server is busy preparing other documents; try again in about 4 min');
    expect(bootstrapBusyMessage(1)).toContain('about 1 min');
  });
});
