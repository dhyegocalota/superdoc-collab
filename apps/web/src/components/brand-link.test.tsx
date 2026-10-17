import { AppRoute } from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { APP_NAME } from '@/lib/app-copy';
import { HOME_LINK_LABEL } from '@/features/editor/editor-copy';
import { renderWithProviders } from '@/testing/render-with-providers';
import { BrandLink } from './brand-link';

test('links to documents, named "SuperDoc Collab, back to documents", with no arrow', () => {
  const { container } = renderWithProviders(<BrandLink />);
  const link = screen.getByRole('link', { name: HOME_LINK_LABEL });
  expect(link).toHaveAttribute('href', AppRoute.Documents);
  expect(link).toHaveClass('hover:bg-accent');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(container.querySelector('svg.lucide-arrow-left')).not.toBeInTheDocument();
});

test('draws a primary mark with a file icon and the app name hidden below sm', () => {
  renderWithProviders(<BrandLink />);
  const link = screen.getByRole('link', { name: HOME_LINK_LABEL });
  const mark = link.querySelector('.bg-primary')!;
  expect(mark).toHaveClass('size-6', 'rounded-sm', 'text-primary-foreground');
  expect(mark.querySelector('svg.lucide-file-text')).toBeInTheDocument();
  expect(screen.getByText(APP_NAME)).toHaveClass('hidden', 'sm:inline', 'font-semibold');
});
