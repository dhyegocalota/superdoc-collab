export enum AuthReply {
  Authenticated = 'authenticated',
  Denied = 'denied',
  Other = 'other',
}

export function authReplyOf(_: Uint8Array): AuthReply {
  throw new Error('authReplyOf is not implemented');
}
