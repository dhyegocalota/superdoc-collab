import { MessageType } from '@hocuspocus/server';
import { createHmac } from 'node:crypto';
import { LruMap } from '../limits/lru-map';
import type { WebSocket } from 'ws';

const PSEUDONYM_CACHE_ENTRIES = 4096;
const PSEUDONYM_CACHE_KEY_SEPARATOR = '\0';
const VISIBLE_STATE_KEYS = [
  'schemaVersion',
  'connectionId',
  'state',
  'lastObservedAt',
  'displayName',
  'color',
  'activeStoryId',
  'selection',
  'operationIntent',
] as const;
const VISIBLE_EXTENSION_KEYS = ['superdocV2CursorUi'] as const;
const VISIBLE_USER_KEYS = ['name', 'color'] as const;
const PSEUDONYM_DIGEST = 'sha256';
const PSEUDONYM_PARTS_SEPARATOR = ':';
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

const pseudonyms = new LruMap<string>({ isOverBudget: (entries) => entries.size > PSEUDONYM_CACHE_ENTRIES });

function pseudonymOf({ id, secret, roomName }: { id: unknown; secret: string; roomName: string }): string | undefined {
  if (typeof id !== 'string') return undefined;
  const key = [secret, roomName, id].join(PSEUDONYM_CACHE_KEY_SEPARATOR);
  const cached = pseudonyms.get(key);
  if (cached !== null) return cached;
  const pseudonym = createHmac(PSEUDONYM_DIGEST, secret)
    .update(`${roomName}${PSEUDONYM_PARTS_SEPARATOR}${id}`)
    .digest('hex')
    .slice(0, PSEUDONYM_LENGTH);
  pseudonyms.set({ key, value: pseudonym });
  return pseudonym;
}

function picked({ source, keys }: { source: Record<string, unknown>; keys: readonly string[] }): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scrubbedState({ state, secret, roomName }: { state: unknown; secret: string; roomName: string }): unknown {
  if (!isRecord(state)) return state;
  const visible = picked({ source: state, keys: VISIBLE_STATE_KEYS });
  const userId = pseudonymOf({ id: state.userId, secret, roomName });
  const extensions = isRecord(state.extensions) ? picked({ source: state.extensions, keys: VISIBLE_EXTENSION_KEYS }) : {};
  const user = isRecord(state.user) ? picked({ source: state.user, keys: VISIBLE_USER_KEYS }) : null;
  const userPseudonym = isRecord(state.user) ? pseudonymOf({ id: state.user.id, secret, roomName }) : undefined;
  return {
    ...visible,
    ...(Object.keys(extensions).length > 0 && { extensions }),
    ...(userId !== undefined && { userId }),
    ...(user !== null && { user: { ...(userPseudonym !== undefined && { id: userPseudonym }), ...user } }),
  };
}

function encodedEntry({ entry, secret, roomName }: { entry: AwarenessEntry; secret: string; roomName: string }): number[] {
  const { clientId, clock, state } = entry;
  const json = [...Buffer.from(JSON.stringify(scrubbedState({ state, secret, roomName })))];
  return [...varUint(clientId), ...varUint(clock), ...varUint(json.length), ...json];
}

export function scrubAwarenessFrame({ frame, secret }: { frame: Uint8Array; secret: string }): Uint8Array {
  const bytes = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
  const roomNameLength = readVarUint({ bytes, offset: 0 });
  const roomNameEnd = roomNameLength.next + roomNameLength.value;
  const roomName = bytes.subarray(roomNameLength.next, roomNameEnd).toString();
  const type = readVarUint({ bytes, offset: roomNameEnd });
  if (type.value !== MessageType.Awareness) return frame;
  const payloadLength = readVarUint({ bytes, offset: type.next });
  const count = readVarUint({ bytes, offset: payloadLength.next });
  const entries = readEntries({ bytes, offset: count.next, remaining: count.value }).flatMap((entry) =>
    encodedEntry({ entry, secret, roomName }),
  );
  const payload = [...varUint(count.value), ...entries];
  return Uint8Array.from([...bytes.subarray(0, type.next), ...varUint(payload.length), ...payload]);
}

export function scrubOutgoingAwareness({ webSocket, secret }: { webSocket: WebSocket; secret: string }): void {
  const send = webSocket.send.bind(webSocket) as (...parameters: unknown[]) => void;
  webSocket.send = ((frame: Uint8Array, ...parameters: unknown[]) =>
    send(scrubAwarenessFrame({ frame, secret }), ...parameters)) as WebSocket['send'];
}
