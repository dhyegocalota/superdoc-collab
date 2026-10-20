import { IncomingMessage, MessageType } from '@hocuspocus/server';

export enum AuthReply {
  Authenticated = 'authenticated',
  Denied = 'denied',
  Other = 'other',
}

enum AuthSubtype {
  PermissionDenied = 1,
  Authenticated = 2,
}

const REPLY_BY_SUBTYPE = new Map<number, AuthReply>([
  [AuthSubtype.PermissionDenied, AuthReply.Denied],
  [AuthSubtype.Authenticated, AuthReply.Authenticated],
]);

function readHeader(frame: Uint8Array): { messageType: number; subtype: number } {
  const message = new IncomingMessage(frame);
  message.readVarString();
  const messageType = message.readVarUint();
  return { messageType, subtype: message.readVarUint() };
}

export function deniedReasonOf(frame: Uint8Array): string | null {
  try {
    const message = new IncomingMessage(frame);
    message.readVarString();
    message.readVarUint();
    message.readVarUint();
    return message.readVarString();
  } catch {
    return null;
  }
}

export function authReplyOf(frame: Uint8Array): AuthReply {
  try {
    const { messageType, subtype } = readHeader(frame);
    if (messageType !== MessageType.Auth) return AuthReply.Other;
    const reply = REPLY_BY_SUBTYPE.get(subtype);
    if (reply === undefined) return AuthReply.Other;
    return reply;
  } catch {
    return AuthReply.Other;
  }
}
