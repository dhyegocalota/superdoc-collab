import { HEAVY_ROOMS_FULL_REASON, HEAVY_ROOMS_USER_CAP_REASON, HeavyRoomsRefusal } from '@superdoc-collab/types';
import { CollaborationAuthenticationError } from './authenticate-member';

export class HeavyRoomsFullError extends CollaborationAuthenticationError {
  readonly reason = HEAVY_ROOMS_FULL_REASON;
}

export class HeavyRoomsUserCapError extends CollaborationAuthenticationError {
  readonly reason = HEAVY_ROOMS_USER_CAP_REASON;
}

export function heavyRoomsErrorOf(refusal: HeavyRoomsRefusal): CollaborationAuthenticationError {
  if (refusal === HeavyRoomsRefusal.UserCap) return new HeavyRoomsUserCapError();
  return new HeavyRoomsFullError();
}
