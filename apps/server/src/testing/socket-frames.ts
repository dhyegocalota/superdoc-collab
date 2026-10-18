const AWARENESS_MESSAGE_TYPE = 1;
const SYNC_MESSAGE_TYPE = 0;
const AUTH_MESSAGE_TYPE = 2;
const SYNC_STEP_ONE = 0;
const EMPTY_AWARENESS_PAYLOAD = [1, 0];
const SINGLE_BYTE_LIMIT = 128;

function roomNameBytes(roomName: string): Buffer {
  const name = Buffer.from(roomName, 'utf8');
  if (name.length >= SINGLE_BYTE_LIMIT) throw new Error('socket frame helpers take room names shorter than 128 bytes');
  return Buffer.concat([Buffer.from([name.length]), name]);
}

export function awarenessFrame(roomName: string): Buffer {
  return Buffer.concat([roomNameBytes(roomName), Buffer.from([AWARENESS_MESSAGE_TYPE, ...EMPTY_AWARENESS_PAYLOAD])]);
}

export function syncStepOneFrame(roomName: string): Buffer {
  return Buffer.concat([roomNameBytes(roomName), Buffer.from([SYNC_MESSAGE_TYPE, SYNC_STEP_ONE, 0])]);
}

export function authFrame(roomName: string): Buffer {
  return Buffer.concat([roomNameBytes(roomName), Buffer.from([AUTH_MESSAGE_TYPE, 0])]);
}
