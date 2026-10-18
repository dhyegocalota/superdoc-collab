import type { RawData } from 'ws';

export enum FrameBucket {
  Updates = 'updates',
  Awareness = 'awareness',
}

const AWARENESS_MESSAGE_TYPE = 1;
const VARINT_CONTINUATION_BIT = 0x80;
const VARINT_PAYLOAD_MASK = 0x7f;
const VARINT_BITS_PER_BYTE = 7;
const MAX_VARINT_BYTES = 5;

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

export function frameBucketOf(frame: RawData): FrameBucket {
  const bytes = bufferOf(frame);
  const roomNameLength = readVarUint({ bytes, offset: 0 });
  if (roomNameLength === null) return FrameBucket.Updates;
  const messageType = readVarUint({ bytes, offset: roomNameLength.next + roomNameLength.value });
  if (messageType === null) return FrameBucket.Updates;
  if (messageType.value === AWARENESS_MESSAGE_TYPE) return FrameBucket.Awareness;
  return FrameBucket.Updates;
}
