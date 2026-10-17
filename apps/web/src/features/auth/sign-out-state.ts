export const SIGNED_OUT_STATE = { signedOut: true };

export function isSignedOutState(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'signedOut' in state;
}
