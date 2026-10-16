import { documentPagePath, FILTER_MAX_LENGTH } from '@superdoc-history/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { DOCUMENT_ID } from '@/test/opened-document';
import { renderWithProviders } from '@/test/render-with-providers';
import { FilterBox } from './filter-box';
import { CLEAR_FILTERS_LABEL, FILTER_LABEL, REMOVE_FILTER_LABEL } from './timeline-copy';

const ROUTE = documentPagePath(DOCUMENT_ID);

test('Enter on @bruno filters by person and the chip removes it', async () => {
  const user = userEvent.setup();
  const { router } = renderWithProviders(<FilterBox />, { route: ROUTE });
  await user.type(screen.getByLabelText(FILTER_LABEL), '@bruno{Enter}');
  expect(router.state.location.search).toBe('?author=bruno');
  await user.click(screen.getByRole('button', { name: `${REMOVE_FILTER_LABEL} bruno` }));
  expect(router.state.location.search).toBe('');
});

test('a text filter and a person filter combine and Clear filters drops both', async () => {
  const user = userEvent.setup();
  const { router } = renderWithProviders(<FilterBox />, { route: ROUTE });
  await user.type(screen.getByLabelText(FILTER_LABEL), 'budget{Enter}');
  await user.type(screen.getByLabelText(FILTER_LABEL), '@ana{Enter}');
  expect(router.state.location.search).toBe('?term=budget&author=ana');
  expect(screen.getAllByRole('button', { name: new RegExp(REMOVE_FILTER_LABEL) })).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: CLEAR_FILTERS_LABEL }));
  expect(router.state.location.search).toBe('');
});

test('an entry longer than the limit is cut', async () => {
  const user = userEvent.setup();
  const { router } = renderWithProviders(<FilterBox />, { route: ROUTE });
  await user.click(screen.getByLabelText(FILTER_LABEL));
  await user.paste('a'.repeat(FILTER_MAX_LENGTH + 100));
  await user.keyboard('{Enter}');
  expect(new URLSearchParams(router.state.location.search).get('term')).toHaveLength(FILTER_MAX_LENGTH);
});

test('a blank entry changes nothing', async () => {
  const user = userEvent.setup();
  const { router } = renderWithProviders(<FilterBox />, { route: ROUTE });
  await user.type(screen.getByLabelText(FILTER_LABEL), '   {Enter}');
  expect(router.state.location.search).toBe('');
});
