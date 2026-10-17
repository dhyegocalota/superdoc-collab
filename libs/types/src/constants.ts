export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 0;
export const VERSION_MARK_MS = MINUTE_MS;
export const VERSION_ROOM_IDLE_MS = MINUTE_MS;
export const VERSION_ROOMS_LIMIT = 32;
export const VERSION_CACHE_SIZE = 16;
export const TIMELINE_PIPELINE_CACHE_SIZE = 32;
export const VERSION_CACHE_MAX_BYTES = 256 * 1024 * 1024;
export const VERSION_FAILURE_TTL_MS = 30 * SECOND_MS;
export const MIN_RETRY_AFTER_MS = SECOND_MS;
export const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

export function secondsRoundedUp(milliseconds: number): number {
  return Math.ceil(milliseconds / SECOND_MS);
}
