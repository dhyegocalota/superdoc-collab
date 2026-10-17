import type { TimeZoneSource } from '@superdoc-collab/types';

export function useTimeZone(): { timeZone: string; source: TimeZoneSource } {
  throw new Error('useTimeZone is not implemented');
}
