import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { CARDS_VIEW_LABEL, DOCUMENTS_VIEW_LABEL, TABLE_VIEW_LABEL } from './documents-copy';
import { DocumentsViewToggle } from './documents-view-toggle';
import { DocumentsView } from './use-documents-view';

test('the toggle is a radio group with the current view checked', () => {
  render(<DocumentsViewToggle view={DocumentsView.Cards} onChange={vi.fn()} />);
  expect(screen.getByRole('radiogroup', { name: DOCUMENTS_VIEW_LABEL })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: CARDS_VIEW_LABEL })).toBeChecked();
  expect(screen.getByRole('radio', { name: TABLE_VIEW_LABEL })).not.toBeChecked();
});

test('choosing the other view reports it', async () => {
  const onChange = vi.fn();
  render(<DocumentsViewToggle view={DocumentsView.Cards} onChange={onChange} />);
  await userEvent.click(screen.getByRole('radio', { name: TABLE_VIEW_LABEL }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(DocumentsView.Table);
});

test('choosing the checked view again keeps it', async () => {
  const onChange = vi.fn();
  render(<DocumentsViewToggle view={DocumentsView.Cards} onChange={onChange} />);
  await userEvent.click(screen.getByRole('radio', { name: CARDS_VIEW_LABEL }));
  expect(onChange).not.toHaveBeenCalled();
});
