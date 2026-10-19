import { MessageType } from '@hocuspocus/server';
import { MAX_AWARENESS_ENTRIES_PER_FRAME } from '@superdoc-collab/types';
import type { RawData } from 'ws';

export enum FrameBucket {
  Updates = 'updates',
  Awareness = 'awareness',
}

const VARINT_CONTINUATION_BIT = 0x80;
const VARINT_PAYLOAD_MASK = 0x7f;
const VARINT_BITS_PER_BYTE = 7;
const MAX_CANONICAL_VARINT_BYTES = 5;
const MAX_SCANNED_VARINT_BYTES = MAX_CANONICAL_VARINT_BYTES + 1;
const MAX_CLOCK_VARINT_BYTES = 8;

// NB ADR 0040: a varint is read at most six bytes deep and one still continuing there is overlong, because the decoder behind this layer accepts padding of any length and scanning for its end would cost a whole 80 MiB frame.
export const UNREADABLE_ENTRY_COUNT = Number.POSITIVE_INFINITY;

type VarUint = { value: number; next: number; byteCount: number; isOverlong: boolean };

function readVarUint({
  bytes,
  offset,
  maxBytes = MAX_SCANNED_VARINT_BYTES,
}: {
  bytes: Buffer;
  offset: number;
  maxBytes?: number;
}): VarUint | null {
  const candidate = bytes.subarray(offset, offset + maxBytes);
  const lastByteIndex = candidate.findIndex((byte) => (byte & VARINT_CONTINUATION_BIT) === 0);
  const isOverlong = lastByteIndex === -1 && candidate.length === maxBytes;
  if (isOverlong) return { value: UNREADABLE_ENTRY_COUNT, next: offset + candidate.length, byteCount: candidate.length, isOverlong };
  if (lastByteIndex === -1) return null;
  const value = candidate.subarray(0, lastByteIndex + 1).reduce((sum, byte, index) => {
    const payload = byte & VARINT_PAYLOAD_MASK;
    return payload === 0 ? sum : sum + payload * 2 ** (index * VARINT_BITS_PER_BYTE);
  }, 0);
  return { value, next: offset + lastByteIndex + 1, byteCount: lastByteIndex + 1, isOverlong };
}

function bufferOf(frame: RawData): Buffer {
  if (Array.isArray(frame)) return Buffer.concat(frame);
  if (Buffer.isBuffer(frame)) return frame;
  return Buffer.from(frame);
}

function headerOf(bytes: Buffer): { roomNameLength: VarUint; messageType: VarUint | null } | null {
  const roomNameLength = readVarUint({ bytes, offset: 0 });
  if (roomNameLength === null) return null;
  if (roomNameLength.isOverlong) return { roomNameLength, messageType: null };
  const messageType = readVarUint({ bytes, offset: roomNameLength.next + roomNameLength.value });
  return { roomNameLength, messageType };
}

export function frameBucketOf(frame: RawData): FrameBucket {
  const header = headerOf(bufferOf(frame));
  if (header?.messageType?.value === MessageType.Awareness) return FrameBucket.Awareness;
  return FrameBucket.Updates;
}

type AwarenessReading = { entryCount: number; clocks: number[] };

const UNREADABLE_READING: AwarenessReading = { entryCount: UNREADABLE_ENTRY_COUNT, clocks: [] };

function isCanonical({ byteCount }: VarUint): boolean {
  return byteCount <= MAX_CANONICAL_VARINT_BYTES;
}

function readEntry({ bytes, offset }: { bytes: Buffer; offset: number }): { clock: number; next: number } | null {
  const clientId = readVarUint({ bytes, offset });
  if (clientId === null || !isCanonical(clientId)) return null;
  const clock = readVarUint({ bytes, offset: clientId.next, maxBytes: MAX_CLOCK_VARINT_BYTES });
  if (clock === null) return null;
  const stateLength = readVarUint({ bytes, offset: clock.next });
  if (stateLength === null || !isCanonical(stateLength)) return null;
  const next = stateLength.next + stateLength.value;
  if (next > bytes.length) return null;
  return { clock: clock.value, next };
}

function clocksOf({ bytes, offset, count }: { bytes: Buffer; offset: number; count: number }): number[] | null {
  const walk = Array.from({ length: count }).reduce<{ next: number; clocks: number[] } | null>(
    (position) => {
      if (position === null) return null;
      const entry = readEntry({ bytes, offset: position.next });
      if (entry === null) return null;
      return { next: entry.next, clocks: [...position.clocks, entry.clock] };
    },
    { next: offset, clocks: [] },
  );
  return walk === null ? null : walk.clocks;
}

function readAwareness(frame: RawData): AwarenessReading | null {
  const bytes = bufferOf(frame);
  const header = headerOf(bytes);
  if (header === null) return null;
  const hasOverlongHeader = header.roomNameLength.isOverlong || header.messageType?.isOverlong;
  if (hasOverlongHeader) return UNREADABLE_READING;
  if (header.messageType?.value !== MessageType.Awareness) return null;
  const payloadLength = readVarUint({ bytes, offset: header.messageType.next });
  if (payloadLength === null) return UNREADABLE_READING;
  const entryCount = readVarUint({ bytes, offset: payloadLength.next });
  if (entryCount === null) return UNREADABLE_READING;
  const varints = [header.roomNameLength, header.messageType, payloadLength, entryCount];
  if (!varints.every(isCanonical)) return UNREADABLE_READING;
  if (entryCount.value > MAX_AWARENESS_ENTRIES_PER_FRAME) return { entryCount: entryCount.value, clocks: [] };
  const clocks = clocksOf({ bytes, offset: entryCount.next, count: entryCount.value });
  if (clocks === null) return UNREADABLE_READING;
  return { entryCount: entryCount.value, clocks };
}

export function awarenessEntryCountOf(frame: RawData): number | null {
  const reading = readAwareness(frame);
  return reading === null ? null : reading.entryCount;
}

export function awarenessEntriesOf(frame: RawData): { clientId: number; clock: number }[] {
  throw new Error('awarenessEntriesOf is not implemented');
}

export function awarenessClocksOf(frame: RawData): number[] {
  const reading = readAwareness(frame);
  return reading === null ? [] : reading.clocks;
}
