import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SuperDoc } from 'superdoc';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { FIND_IN_DOCUMENT_LABEL } from './editor-copy';
import { FindButton } from './find-button';

test('click emits search:open on the editor instance', async () => {
  const emit = vi.fn();
  renderWithProviders(<FindButton superdoc={{ emit } as unknown as SuperDoc} />);
  await userEvent.click(screen.getByRole('button', { name: FIND_IN_DOCUMENT_LABEL }));
  expect(emit).toHaveBeenCalledTimes(1);
  expect(emit).toHaveBeenCalledWith('search:open');
});

test('a click before the editor is ready does nothing', async () => {
  renderWithProviders(<FindButton superdoc={null} />);
  await userEvent.click(screen.getByRole('button', { name: FIND_IN_DOCUMENT_LABEL }));
  expect(screen.getByRole('button', { name: FIND_IN_DOCUMENT_LABEL })).toBeEnabled();
});
