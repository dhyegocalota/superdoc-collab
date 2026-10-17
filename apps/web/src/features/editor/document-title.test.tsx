import { DocumentRole, documentApiPath, HttpMethod, HttpStatus } from '@superdoc-collab/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { DOCUMENT_ID, DOCUMENT_TITLE } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { renameTitleLabel, TITLE_LABEL } from './editor-copy';
import { DocumentTitle } from './document-title';

const RENAMED_TITLE = 'Renamed';

function renderTitle(role: DocumentRole): void {
  renderWithProviders(<DocumentTitle documentId={DOCUMENT_ID} title={DOCUMENT_TITLE} role={role} />);
}

function patchRequests(fetchSpy: ReturnType<typeof vi.spyOn>) {
  return fetchSpy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === HttpMethod.Patch);
}

afterEach(() => vi.restoreAllMocks());

test('click shows an input with the title selected, Enter saves and Escape restores', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  renderTitle(DocumentRole.Editor);
  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  const input = screen.getByRole('textbox', { name: TITLE_LABEL }) as HTMLInputElement;
  expect(input).toHaveFocus();
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, DOCUMENT_TITLE.length]);

  await userEvent.keyboard(`${RENAMED_TITLE}{Enter}`);
  await waitFor(() => expect(patchRequests(fetchSpy)).toHaveLength(1));
  const [path, init] = patchRequests(fetchSpy)[0] as [string, RequestInit];
  expect(path).toBe(documentApiPath({ documentId: DOCUMENT_ID }));
  expect(init.body).toBe(JSON.stringify({ title: RENAMED_TITLE }));
  expect(screen.getByRole('button', { name: renameTitleLabel(RENAMED_TITLE) })).toHaveFocus();

  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(RENAMED_TITLE) }));
  await userEvent.keyboard('Discarded{Escape}');
  expect(screen.queryByRole('textbox', { name: TITLE_LABEL })).toBeNull();
  expect(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) })).toHaveFocus();
  expect(patchRequests(fetchSpy)).toHaveLength(1);
});

test('an empty value restores the old title and sends no request', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderTitle(DocumentRole.Owner);
  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  await userEvent.keyboard('{Backspace}{Enter}');
  expect(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) })).toBeVisible();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a reader gets an h1 and no button', () => {
  renderTitle(DocumentRole.Reader);
  expect(screen.getByRole('heading', { level: 1, name: DOCUMENT_TITLE })).toBeVisible();
  expect(screen.queryByRole('button')).toBeNull();
});
