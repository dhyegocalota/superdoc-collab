import { MessageType } from '@hocuspocus/server';

const SYNC_STEP_ONE = 0;
const EMPTY_AWARENESS_PAYLOAD = [1, 0];
const SINGLE_BYTE_LIMIT = 128;
const CLAIMED_STATE = { userId: 'claimed' };

function roomNameBytes(roomName: string): Buffer {
  const name = Buffer.from(roomName, 'utf8');
  return Buffer.concat([Buffer.from(varUint(name.length)), name]);
}

export function awarenessFrame(roomName: string): Buffer {
  return Buffer.concat([roomNameBytes(roomName), Buffer.from([MessageType.Awareness, ...EMPTY_AWARENESS_PAYLOAD])]);
}

function varUint(value: number): number[] {
  if (value < SINGLE_BYTE_LIMIT) return [value];
  return [(value % SINGLE_BYTE_LIMIT) + SINGLE_BYTE_LIMIT, ...varUint(Math.floor(value / SINGLE_BYTE_LIMIT))];
}

export function awarenessFrameClaiming({
  roomName,
  clientIds,
  clock = 1,
  state = CLAIMED_STATE,
}: {
  roomName: string;
  clientIds: number[];
  clock?: number;
  state?: object | null;
}): Buffer {
  const encodedState = Buffer.from(JSON.stringify(state), 'utf8');
  const entries = clientIds.flatMap((clientId) => [
    ...varUint(clientId),
    ...varUint(clock),
    ...varUint(encodedState.length),
    ...encodedState,
  ]);
  const update = Buffer.from([...varUint(clientIds.length), ...entries]);
  return Buffer.concat([roomNameBytes(roomName), Buffer.from([MessageType.Awareness, ...varUint(update.length)]), update]);
}

export function syncStepOneFrame(roomName: string): Buffer {
  return Buffer.concat([roomNameBytes(roomName), Buffer.from([MessageType.Sync, SYNC_STEP_ONE, 0])]);
}

export function authFrame(roomName: string): Buffer {
  return Buffer.concat([roomNameBytes(roomName), Buffer.from([MessageType.Auth, 0])]);
}
