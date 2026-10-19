import { AppRoute } from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ABOUT_LINK_LABEL } from '@/features/about/about-copy';
import { APP_NAME } from '@/lib/app-copy';
import { renderWithProviders } from '@/testing/render-with-providers';
import { AUTH_TAGLINE, AUTH_VALUE_LINES } from './auth-copy';
import { AuthLayout } from './auth-layout';

const CARD_TEXT = 'Card content';

function renderLayout() {
  return renderWithProviders(
    <AuthLayout>
      <main>{CARD_TEXT}</main>
    </AuthLayout>,
  );
}

test('the panel names the app, states the tagline and lists the value lines', () => {
  renderLayout();
  expect(screen.getByText(APP_NAME)).toBeInTheDocument();
  expect(screen.getByText(AUTH_TAGLINE)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(AUTH_VALUE_LINES);
});

test('the panel links to About', () => {
  renderLayout();
  expect(screen.getByRole('link', { name: ABOUT_LINK_LABEL })).toHaveAttribute('href', AppRoute.About);
});

test('the card content is rendered unchanged beside the panel', () => {
  renderLayout();
  expect(screen.getByRole('main')).toHaveTextContent(CARD_TEXT);
  expect(screen.getByRole('complementary')).toBeInTheDocument();
});

test('below lg the panel collapses to a compact header, with the value lines and the illustration shown from lg', () => {
  renderLayout();
  expect(screen.getByRole('list')).toHaveClass('hidden', 'lg:block');
  expect(document.querySelector('svg.w-full')).toHaveClass('hidden', 'lg:block');
  expect(screen.getByRole('complementary')).toHaveClass('lg:order-2');
});
