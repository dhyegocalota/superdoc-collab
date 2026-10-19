import { TimeZoneSource, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { useTimeZone } from './use-time-zone';

vi.mock('./browser-time-zone', () => ({ browserTimeZone: () => 'Europe/Lisbon' }));

const ACCOUNT_ZONE = 'Asia/Kathmandu';
const BROWSER_ZONE = 'Europe/Lisbon';
const USER: SessionUser = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  role: UserRole.User,
  timeZone: ACCOUNT_ZONE,
  impersonatedBy: null,
};

function zoneFor(user: SessionUser) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, user);
  return renderHookWithRouter(useTimeZone, { queryClient }).result.current;
}

test('the account zone wins and is labelled as the account', () => {
  expect(zoneFor(USER)).toEqual({ timeZone: ACCOUNT_ZONE, source: TimeZoneSource.Account });
});

test('a null account zone falls back to the browser zone and says so', () => {
  expect(zoneFor({ ...USER, timeZone: null })).toEqual({ timeZone: BROWSER_ZONE, source: TimeZoneSource.Browser });
});

test('a stored zone the runtime does not resolve falls back to the browser zone', () => {
  expect(zoneFor({ ...USER, timeZone: 'Mars/Olympus' })).toEqual({ timeZone: BROWSER_ZONE, source: TimeZoneSource.Browser });
});
