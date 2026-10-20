import { HEAVY_ROOMS_FULL_REASON } from '@superdoc-collab/types';
import { CollaborationAuthenticationError } from './authenticate-member';

export class HeavyRoomsFullError extends CollaborationAuthenticationError {
  readonly reason = `${HEAVY_ROOMS_FULL_REASON.length}`;
}
