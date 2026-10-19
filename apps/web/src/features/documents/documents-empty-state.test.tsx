import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  CHOOSE_FILE_LABEL,
  DROP_ZONE_LABEL,
  EMPTY_STATE_DESCRIPTION,
  EMPTY_STATE_HEADING,
  FILE_INPUT_LABEL,
  NEW_DOCUMENT_LABEL,
} from './documents-copy';
import { DocumentsEmptyState } from './documents-empty-state';
import type { DocumentUpload } from './use-upload-document';

const IDLE_UPLOAD: DocumentUpload = { progress: null, uploadFiles: vi.fn(), clear: vi.fn(), message: null, isPending: false };

test('shows the empty state when both lists are empty', () => {
  renderWithProviders(<DocumentsEmptyState isCreating={false} onCreate={vi.fn()} upload={IDLE_UPLOAD} />);
  expect(screen.getByRole('heading', { name: EMPTY_STATE_HEADING })).toBeVisible();
  expect(screen.getByText(EMPTY_STATE_DESCRIPTION)).toBeVisible();
  expect(screen.getByText(DROP_ZONE_LABEL)).toBeVisible();
  expect(screen.getByRole('button', { name: CHOOSE_FILE_LABEL })).toBeVisible();
  expect(screen.getByLabelText(FILE_INPUT_LABEL)).toBeInTheDocument();
});

test('New document calls onCreate', async () => {
  const onCreate = vi.fn();
  renderWithProviders(<DocumentsEmptyState isCreating={false} onCreate={onCreate} upload={IDLE_UPLOAD} />);
  const button = screen.getByRole('button', { name: NEW_DOCUMENT_LABEL });
  await userEvent.click(button);
  expect(onCreate).toHaveBeenCalledTimes(1);
});

test('New document is disabled while a document is being created', () => {
  renderWithProviders(<DocumentsEmptyState isCreating onCreate={vi.fn()} upload={IDLE_UPLOAD} />);
  expect(screen.getByRole('button', { name: NEW_DOCUMENT_LABEL })).toBeDisabled();
});
