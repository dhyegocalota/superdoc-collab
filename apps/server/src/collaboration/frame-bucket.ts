import { MessageType } from '@hocuspocus/server';
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

// NB ADR 0040: a varint is read at most six bytes deep and one still continuing there is overlong, because the decoder behind this layer accepts padding of any length and scanning for its end would cost a whole 80 MiB frame.
export const UNREADABLE_ENTRY_COUNT = Number.POSITIVE_INFINITY;

type VarUint = { value: number; next: number; byteCount: number; isOverlong: boolean };

function readVarUint({ bytes, offset }: { bytes: Buffer; offset: number }): VarUint | null {
  const candidate = bytes.subarray(offset, offset + MAX_SCANNED_VARINT_BYTES);
  const lastByteIndex = candidate.findIndex((byte) => (byte & VARINT_CONTINUATION_BIT) === 0);
  const isOverlong = lastByteIndex === -1 && candidate.length === MAX_SCANNED_VARINT_BYTES;
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

export function awarenessEntryCountOf(frame: RawData): number | null {
  const bytes = bufferOf(frame);
  const header = headerOf(bytes);
  if (header === null) return null;
  const hasOverlongHeader = header.roomNameLength.isOverlong || header.messageType?.isOverlong;
  if (hasOverlongHeader) return UNREADABLE_ENTRY_COUNT;
  if (header.messageType?.value !== MessageType.Awareness) return null;
  const payloadLength = readVarUint({ bytes, offset: header.messageType.next });
  if (payloadLength === null) return UNREADABLE_ENTRY_COUNT;
  const entryCount = readVarUint({ bytes, offset: payloadLength.next });
  if (entryCount === null) return UNREADABLE_ENTRY_COUNT;
  const varints = [header.roomNameLength, header.messageType, payloadLength, entryCount];
  const isCanonical = varints.every(({ byteCount }) => byteCount <= MAX_CANONICAL_VARINT_BYTES);
  return isCanonical ? entryCount.value : UNREADABLE_ENTRY_COUNT;
}
