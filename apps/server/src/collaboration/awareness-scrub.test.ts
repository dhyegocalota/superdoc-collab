import { MessageType } from '@hocuspocus/server';
import { expect, test } from 'vitest';
import { scrubAwarenessFrame } from './awareness-scrub';

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

function awarenessFrame(entries: { clientId: number; clock: number; state: unknown }[]): Uint8Array {
  const payload = [
    ...varUint(entries.length),
    ...entries.flatMap(({ clientId, clock, state }) => [...varUint(clientId), ...varUint(clock), ...varString(JSON.stringify(state))]),
  ];
  return Uint8Array.from([...varString(ROOM_NAME), ...varUint(MessageType.Awareness), ...varUint(payload.length), ...payload]);
}

test('an awareness frame loses the email and the ids of its users and keeps their name and colour', () => {
  const state = {
    user: { id: 'user-1', name: 'Ana', email: 'ana@example.com', color: '#ff0000' },
    userId: 'user-1',
    cursor: { anchor: 3 },
  };
  const scrubbed = scrubAwarenessFrame(awarenessFrame([{ clientId: 7, clock: 2, state }]));
  const text = Buffer.from(scrubbed).toString();
  expect([text.includes('@'), text.includes('user-1'), text.includes('email')]).toEqual([false, false, false]);
  expect(text).toContain('"user":{"name":"Ana","color":"#ff0000"}');
  expect(text).toContain('"cursor":{"anchor":3}');
});

test('every entry is scrubbed, a removed client stays removed and a long state survives the new length', () => {
  const states = [
    { user: { id: 'a', name: 'Ana', email: 'a@example.com', color: '#111111' }, padding: LONG_STATE_PADDING },
    null,
    { user: { id: 'b', name: 'Bruno', email: 'b@example.com', color: '#222222' } },
  ];
  const scrubbed = scrubAwarenessFrame(awarenessFrame(states.map((state, index) => ({ clientId: index + 1, clock: 1, state }))));
  const text = Buffer.from(scrubbed).toString();
  expect([text.includes('@'), text.includes('"id"')]).toEqual([false, false]);
  expect(text).toContain(LONG_STATE_PADDING);
  expect(text).toContain('null');
  expect(text).toContain('Bruno');
});

test('a state with no user and a frame that is not awareness pass through unchanged', () => {
  const noUser = awarenessFrame([{ clientId: 1, clock: 1, state: { cursor: { anchor: 1 } } }]);
  expect(scrubAwarenessFrame(noUser)).toEqual(noUser);
  const sync = Uint8Array.from([...varString(ROOM_NAME), ...varUint(MessageType.Sync), 0, 1, 0]);
  expect(scrubAwarenessFrame(sync)).toEqual(sync);
});
