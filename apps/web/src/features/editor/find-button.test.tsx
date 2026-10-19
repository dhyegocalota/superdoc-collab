import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { FIND_IN_DOCUMENT_LABEL } from './editor-copy';
import { FindButton } from './find-button';

test('a click before the editor is ready does nothing', async () => {
  renderWithProviders(<FindButton superdoc={null} />);
  await userEvent.click(screen.getByRole('button', { name: FIND_IN_DOCUMENT_LABEL }));
  expect(screen.getByRole('button', { name: FIND_IN_DOCUMENT_LABEL })).toBeEnabled();
});
