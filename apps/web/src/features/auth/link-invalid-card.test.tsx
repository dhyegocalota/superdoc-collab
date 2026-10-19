import { AppRoute } from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { SIGN_IN_LABEL } from './auth-copy';
import { LinkInvalidCard } from './link-invalid-card';

const MESSAGE = 'This link is not valid.';

test('the message and the way back sit beside the auth panel', () => {
  renderWithProviders(<LinkInvalidCard message={MESSAGE} />);
  expect(screen.getByRole('main')).toHaveTextContent(MESSAGE);
  expect(screen.getByRole('link', { name: SIGN_IN_LABEL })).toHaveAttribute('href', AppRoute.SignIn);
  expect(screen.getByRole('complementary')).toBeInTheDocument();
});
