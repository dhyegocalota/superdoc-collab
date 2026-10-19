import { MessageType } from '@hocuspocus/server';
import type { RawData } from 'ws';

export enum FrameBucket {
  Updates = 'updates',
  Awareness = 'awareness',
}

const VARINT_CONTINUATION_BIT = 0x80;
const VARINT_PAYLOAD_MASK = 0x7f;
const VARINT_BITS_PER_BYTE = 7;
const MAX_VARINT_BYTES = 5;

export const UNREADABLE_ENTRY_COUNT = Number.POSITIVE_INFINITY;

type VarUint = { value: number; next: number };

function readVarUint({ bytes, offset }: { bytes: Buffer; offset: number }): VarUint | null {
  const candidate = bytes.subarray(offset, offset + MAX_VARINT_BYTES);
  const lastByteIndex = candidate.findIndex((byte) => (byte & VARINT_CONTINUATION_BIT) === 0);
  if (lastByteIndex === -1) return null;
  const value = [...candidate.subarray(0, lastByteIndex + 1)].reduce(
    (sum, byte, index) => sum + (byte & VARINT_PAYLOAD_MASK) * 2 ** (index * VARINT_BITS_PER_BYTE),
    0,
  );
  return { value, next: offset + lastByteIndex + 1 };
}

function bufferOf(frame: RawData): Buffer {
  if (Array.isArray(frame)) return Buffer.concat(frame);
  if (Buffer.isBuffer(frame)) return frame;
  return Buffer.from(frame);
}

function messageTypeOf(bytes: Buffer): VarUint | null {
  const roomNameLength = readVarUint({ bytes, offset: 0 });
  if (roomNameLength === null) return null;
  return readVarUint({ bytes, offset: roomNameLength.next + roomNameLength.value });
}

export function frameBucketOf(frame: RawData): FrameBucket {
  const messageType = messageTypeOf(bufferOf(frame));
  if (messageType?.value === MessageType.Awareness) return FrameBucket.Awareness;
  return FrameBucket.Updates;
}

export function awarenessEntryCountOf(frame: RawData): number | null {
  const bytes = bufferOf(frame);
  const messageType = messageTypeOf(bytes);
  if (messageType?.value !== MessageType.Awareness) return null;
  const payloadLength = readVarUint({ bytes, offset: messageType.next });
  if (payloadLength === null) return null;
  const entryCount = readVarUint({ bytes, offset: payloadLength.next });
  return entryCount === null ? null : entryCount.value;
}
