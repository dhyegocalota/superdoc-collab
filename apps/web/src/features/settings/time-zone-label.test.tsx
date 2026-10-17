import { AppRoute, TimeZoneSource, UserRole } from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { renderWithProviders } from '@/testing/render-with-providers';
import { FROM_BROWSER_SUFFIX, timesInLabel } from './settings-copy';
import { TimeZoneLabel } from './time-zone-label';

vi.mock('@/lib/browser-time-zone', () => ({ browserTimeZone: () => 'America/Sao_Paulo' }));

test.each([
  { source: TimeZoneSource.Account, timeZone: 'America/Sao_Paulo', text: timesInLabel('America/Sao_Paulo') },
  { source: TimeZoneSource.Browser, timeZone: null, text: `${timesInLabel('America/Sao_Paulo')}${FROM_BROWSER_SUFFIX}` },
])('names the effective zone for the $source source and links to settings', ({ timeZone, text }) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone });
  renderWithProviders(<TimeZoneLabel />, { queryClient });
  expect(screen.getByRole('link', { name: text })).toHaveAttribute('href', AppRoute.Settings);
});
