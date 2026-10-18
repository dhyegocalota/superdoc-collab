import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';
import { AppTopBar } from '@/components/app-top-bar';
import { HOME_LINK_LABEL, LOADING_DOCUMENT_MESSAGE } from './editor-copy';
import { OpeningDocument } from './opening-document';

function withRouter(element: React.ReactElement) {
  return <MemoryRouter>{element}</MemoryRouter>;
}

test('the loading header is the app top bar, so the bar does not jump when the editor header arrives', () => {
  render(withRouter(<OpeningDocument />));
  const loadingHeader = screen.getByRole('banner');
  expect(screen.getByRole('link', { name: HOME_LINK_LABEL })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(LOADING_DOCUMENT_MESSAGE);
  document.body.replaceChildren();
  render(withRouter(<AppTopBar right={null} />));
  expect(loadingHeader.className).toBe(screen.getByRole('banner').className);
});
