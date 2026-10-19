import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { HOME_LINK_LABEL } from '@/features/editor/editor-copy';
import { renderWithProviders } from '@/testing/render-with-providers';
import { AppTopBar } from './app-top-bar';

test('renders the brand link and the right slot in a 52 px bar', () => {
  renderWithProviders(<AppTopBar right={<button type="button">Share</button>} />);
  const bar = screen.getByRole('banner');
  expect(bar).toHaveClass('h-13', 'border-b', 'px-3', 'gap-2', 'flex', 'items-center');
  const [brandLink, rightSlotButton] = [screen.getByRole('link', { name: HOME_LINK_LABEL }), screen.getByRole('button', { name: 'Share' })];
  expect(brandLink.compareDocumentPosition(rightSlotButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(rightSlotButton.parentElement).toHaveClass('ml-auto');
});

test('the left slot sits between the brand link and the right slot', () => {
  renderWithProviders(<AppTopBar left={<span>Quarterly plan</span>} right={<button type="button">Share</button>} />);
  const labels = Array.from(screen.getByRole('banner').querySelectorAll('a, span, button')).map((element) => element.textContent);
  expect(labels.indexOf('Quarterly plan')).toBeGreaterThan(labels.findIndex((text) => text?.includes('SuperDoc')));
  expect(labels.indexOf('Quarterly plan')).toBeLessThan(labels.indexOf('Share'));
});
