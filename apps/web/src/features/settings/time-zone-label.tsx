import { AppRoute, TimeZoneSource } from '@superdoc-collab/types';
import { Link } from 'react-router';
import { useTimeZone } from '@/lib/use-time-zone';
import { FROM_BROWSER_SUFFIX, timesInLabel } from './settings-copy';

export function TimeZoneLabel() {
  const { timeZone, source } = useTimeZone();
  const suffix = source === TimeZoneSource.Browser ? FROM_BROWSER_SUFFIX : '';

  return (
    <Link to={AppRoute.Settings} className="px-2 text-xs text-muted-foreground hover:underline">
      {`${timesInLabel(timeZone)}${suffix}`}
    </Link>
  );
}
