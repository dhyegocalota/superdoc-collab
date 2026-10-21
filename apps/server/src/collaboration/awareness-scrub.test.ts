import { MessageType } from '@hocuspocus/server';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { scrubAwarenessFrame } from './awareness-scrub';

const SECRET = 'pseudonym-secret-'.padEnd(32, 'x');
const OTHER_ROOM_NAME = 'sd2/v2.1/22222222-2222-4222-8222-222222222222';
const ROOM_NAME = 'sd2/v2.1/11111111-1111-4111-8111-111111111111';
const LONG_STATE_PADDING = 'x'.repeat(300);

function varUint(value: number): number[] {
  if (value < 0x80) return [value];
  return [(value & 0x7f) | 0x80, ...varUint(value >>> 7)];
}

function varString(text: string): number[] {
  const bytes = [...Buffer.from(text)];
  return [...varUint(bytes.length), ...bytes];
}

function awarenessFrame(entries: { clientId: number; clock: number; state: unknown }[], roomName = ROOM_NAME): Uint8Array {
  const payload = [
    ...varUint(entries.length),
    ...entries.flatMap(({ clientId, clock, state }) => [...varUint(clientId), ...varUint(clock), ...varString(JSON.stringify(state))]),
  ];
  return Uint8Array.from([...varString(roomName), ...varUint(MessageType.Awareness), ...varUint(payload.length), ...payload]);
}

test('an awareness frame loses the email and the ids of its users and keeps their name and colour', () => {
  const state = {
    user: { id: 'user-1', name: 'Ana', email: 'ana@example.com', color: '#ff0000' },
    userId: 'user-1',
    selection: { anchor: 3 },
  };
  const scrubbed = scrubAwarenessFrame({ frame: awarenessFrame([{ clientId: 7, clock: 2, state }]), secret: SECRET });
  const text = Buffer.from(scrubbed).toString();
  expect([text.includes('@'), text.includes('user-1'), text.includes('email')]).toEqual([false, false, false]);
  expect(text).toMatch(/"user":\{"id":"[0-9a-f]{16}","name":"Ana","color":"#ff0000"\}/);
  expect(text).toMatch(/"userId":"[0-9a-f]{16}"/);
  expect(text).toContain('"selection":{"anchor":3}');
});

test('every entry is scrubbed, a removed client stays removed and a long state survives the new length', () => {
  const states = [
    { user: { id: 'a', name: 'Ana', email: 'a@example.com', color: '#111111' }, selection: { padding: LONG_STATE_PADDING } },
    null,
    { user: { id: 'b', name: 'Bruno', email: 'b@example.com', color: '#222222' } },
  ];
  const scrubbed = scrubAwarenessFrame({
    frame: awarenessFrame(states.map((state, index) => ({ clientId: index + 1, clock: 1, state }))),
    secret: SECRET,
  });
  const text = Buffer.from(scrubbed).toString();
  expect([text.includes('@'), text.includes('"a"'), text.includes('"b"')]).toEqual([false, false, false]);
  expect(text).toContain(LONG_STATE_PADDING);
  expect(text).toContain('null');
  expect(text).toContain('Bruno');
});

test('a state with no user and a frame that is not awareness pass through unchanged', () => {
  const noUser = awarenessFrame([{ clientId: 1, clock: 1, state: { selection: { anchor: 1 } } }]);
  expect(scrubAwarenessFrame({ frame: noUser, secret: SECRET })).toEqual(noUser);
  const sync = Uint8Array.from([...varString(ROOM_NAME), ...varUint(MessageType.Sync), 0, 1, 0]);
  expect(scrubAwarenessFrame({ frame: sync, secret: SECRET })).toEqual(sync);
});

function idOf(frame: Uint8Array): string {
  return /"id":"([0-9a-f]{16})"/.exec(Buffer.from(frame).toString())![1]!;
}

test('the pseudonym of one person is stable in a room and differs by room and by secret', () => {
  const entry = [{ clientId: 1, clock: 1, state: { user: { id: 'user-1', name: 'Ana', color: '#111111' } } }];
  const inRoom = idOf(scrubAwarenessFrame({ frame: awarenessFrame(entry), secret: SECRET }));
  const again = idOf(scrubAwarenessFrame({ frame: awarenessFrame(entry), secret: SECRET }));
  const inOtherRoom = idOf(scrubAwarenessFrame({ frame: awarenessFrame(entry, OTHER_ROOM_NAME), secret: SECRET }));
  const withOtherSecret = idOf(scrubAwarenessFrame({ frame: awarenessFrame(entry), secret: `${SECRET}-other` }));
  expect(again).toBe(inRoom);
  expect(new Set([inRoom, inOtherRoom, withOtherSecret]).size).toBe(3);
});

const CAPTURED_STATE: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('fixtures/superdoc-2.24-awareness-state.json', import.meta.url), 'utf8'),
);

test('the awareness state SuperDoc 2.24 really sends loses the email wherever it sits and keeps what draws a caret', () => {
  const state = { ...CAPTURED_STATE, emailAddress: 'ana@example.com', nested: { deep: { owner: 'ana@example.com' } } };
  const scrubbed = scrubAwarenessFrame({ frame: awarenessFrame([{ clientId: 3, clock: 1, state }]), secret: SECRET });
  const text = Buffer.from(scrubbed).toString('latin1');
  expect(text.includes('@')).toBe(false);
  expect(text).toContain('"displayName":"Ana"');
  expect(text).toContain('"color":"#B82E39"');
  expect(text).toContain('"superdocV2CursorUi"');
  expect(text).toContain('"selection"');
  expect(text).not.toContain('emailAddress');
  expect(text).not.toContain('nested');
  expect(text).not.toContain('"email"');
});
