import { isSupportedTimeZone, TimeZoneSource } from '@superdoc-collab/types';
import { useSession } from '@/features/auth/use-session';
import { browserTimeZone } from './browser-time-zone';

export function useTimeZone(): { timeZone: string; source: TimeZoneSource } {
  const { user } = useSession();
  if (user?.timeZone && isSupportedTimeZone(user.timeZone)) return { timeZone: user.timeZone, source: TimeZoneSource.Account };
  return { timeZone: browserTimeZone(), source: TimeZoneSource.Browser };
}
