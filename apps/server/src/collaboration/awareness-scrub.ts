import { MessageType } from '@hocuspocus/server';
import { createHash } from 'node:crypto';
import type { WebSocket } from 'ws';

const PSEUDONYM_DIGEST = 'sha256';
const PSEUDONYM_LENGTH = 16;
const VARINT_CONTINUATION_BIT = 0x80;
const VARINT_PAYLOAD_MASK = 0x7f;
const VARINT_BITS_PER_BYTE = 7;

type VarUint = { value: number; next: number };
type AwarenessEntry = { clientId: number; clock: number; state: unknown };

function readVarUint({ bytes, offset }: { bytes: Buffer; offset: number }): VarUint {
  const last = bytes.findIndex((byte, index) => index >= offset && (byte & VARINT_CONTINUATION_BIT) === 0);
  const value = [...bytes.subarray(offset, last + 1)].reduce(
    (sum, byte, index) => sum + (byte & VARINT_PAYLOAD_MASK) * 2 ** (index * VARINT_BITS_PER_BYTE),
    0,
  );
  return { value, next: last + 1 };
}

function varUint(value: number): number[] {
  if (value < VARINT_CONTINUATION_BIT) return [value];
  return [(value % VARINT_CONTINUATION_BIT) | VARINT_CONTINUATION_BIT, ...varUint(Math.floor(value / VARINT_CONTINUATION_BIT))];
}

function readEntries({ bytes, offset, remaining }: { bytes: Buffer; offset: number; remaining: number }): AwarenessEntry[] {
  if (remaining === 0) return [];
  const clientId = readVarUint({ bytes, offset });
  const clock = readVarUint({ bytes, offset: clientId.next });
  const length = readVarUint({ bytes, offset: clock.next });
  const end = length.next + length.value;
  const state: unknown = JSON.parse(bytes.subarray(length.next, end).toString());
  return [{ clientId: clientId.value, clock: clock.value, state }, ...readEntries({ bytes, offset: end, remaining: remaining - 1 })];
}

function pseudonymOf(id: unknown): string | undefined {
  if (typeof id !== 'string') return undefined;
  return createHash(PSEUDONYM_DIGEST).update(id).digest('hex').slice(0, PSEUDONYM_LENGTH);
}

function scrubbedState(state: unknown): unknown {
  if (typeof state !== 'object' || state === null) return state;
  const { userId, user, ...rest } = state as Record<string, unknown>;
  const pseudonymousUserId = pseudonymOf(userId);
  const withUserId = pseudonymousUserId === undefined ? rest : { ...rest, userId: pseudonymousUserId };
  if (typeof user !== 'object' || user === null) return withUserId;
  const { id, email: _email, ...visible } = user as Record<string, unknown>;
  const pseudonymousId = pseudonymOf(id);
  return { ...withUserId, user: pseudonymousId === undefined ? visible : { id: pseudonymousId, ...visible } };
}

function encodedEntry({ clientId, clock, state }: AwarenessEntry): number[] {
  const json = [...Buffer.from(JSON.stringify(scrubbedState(state)))];
  return [...varUint(clientId), ...varUint(clock), ...varUint(json.length), ...json];
}

export function scrubAwarenessFrame({ frame, secret }: { frame: Uint8Array; secret: string }): Uint8Array {
  void secret;
  const bytes = Buffer.from(frame);
  const roomNameLength = readVarUint({ bytes, offset: 0 });
  const roomNameEnd = roomNameLength.next + roomNameLength.value;
  const type = readVarUint({ bytes, offset: roomNameEnd });
  if (type.value !== MessageType.Awareness) return frame;
  const payloadLength = readVarUint({ bytes, offset: type.next });
  const count = readVarUint({ bytes, offset: payloadLength.next });
  const entries = readEntries({ bytes, offset: count.next, remaining: count.value }).flatMap(encodedEntry);
  const payload = [...varUint(count.value), ...entries];
  return Uint8Array.from([...bytes.subarray(0, type.next), ...varUint(payload.length), ...payload]);
}

export function scrubOutgoingAwareness({ webSocket, secret }: { webSocket: WebSocket; secret: string }): void {
  const send = webSocket.send.bind(webSocket) as (...parameters: unknown[]) => void;
  webSocket.send = ((frame: Uint8Array, ...parameters: unknown[]) =>
    send(scrubAwarenessFrame({ frame, secret }), ...parameters)) as WebSocket['send'];
}
