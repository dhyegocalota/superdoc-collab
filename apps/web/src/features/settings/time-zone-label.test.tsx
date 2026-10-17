import { AppRoute, TimeZoneSource } from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useTimeZone } from '@/lib/use-time-zone';
import { renderWithProviders } from '@/testing/render-with-providers';
import { FROM_BROWSER_SUFFIX, timesInLabel } from './settings-copy';
import { TimeZoneLabel } from './time-zone-label';

vi.mock('@/lib/use-time-zone');

test.each([
  { source: TimeZoneSource.Account, text: timesInLabel('America/Sao_Paulo') },
  { source: TimeZoneSource.Browser, text: `${timesInLabel('America/Sao_Paulo')}${FROM_BROWSER_SUFFIX}` },
])('names the effective zone for the $source source and links to settings', ({ source, text }) => {
  vi.mocked(useTimeZone).mockReturnValue({ timeZone: 'America/Sao_Paulo', source });
  renderWithProviders(<TimeZoneLabel />);
  expect(screen.getByRole('link', { name: text })).toHaveAttribute('href', AppRoute.Settings);
});
