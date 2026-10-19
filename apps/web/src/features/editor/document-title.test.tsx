import { DocumentRole, documentApiPath, HttpMethod, HttpStatus } from '@superdoc-collab/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi, type MockInstance } from 'vitest';
import { DOCUMENT_ID, DOCUMENT_TITLE } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { CANCEL_TITLE_LABEL, renameTitleLabel, SAVE_TITLE_DISABLED_REASON, SAVE_TITLE_LABEL, TITLE_LABEL } from './editor-copy';
import { DocumentTitle } from './document-title';

function pillTexts(element: HTMLElement): (string | null)[] {
  return [...element.querySelectorAll('kbd')].map((pill) => pill.textContent);
}

const RENAMED_TITLE = 'Renamed';

function renderTitle(role: DocumentRole, onFailureChange = vi.fn(), onDirtyChange = vi.fn(), onEditingChange = vi.fn()): void {
  renderWithProviders(
    <DocumentTitle
      documentId={DOCUMENT_ID}
      title={DOCUMENT_TITLE}
      role={role}
      onFailureChange={onFailureChange}
      onDirtyChange={onDirtyChange}
      onEditingChange={onEditingChange}
    />,
  );
}

function patchRequests(fetchSpy: MockInstance<typeof fetch>) {
  return fetchSpy.mock.calls.filter(([, init]) => init?.method === HttpMethod.Patch);
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
  await waitFor(() => expect(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) })).toHaveFocus());

  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
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

test('a failed save reports the failure upward, and a new save clears it', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: HttpStatus.BadRequest }));
  const onFailureChange = vi.fn();
  renderTitle(DocumentRole.Editor, onFailureChange);
  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  await userEvent.keyboard(`${RENAMED_TITLE}{Enter}`);
  await waitFor(() => expect(onFailureChange).toHaveBeenLastCalledWith(true));
  expect(screen.queryByRole('alert')).toBeNull();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  await userEvent.keyboard(`${RENAMED_TITLE}{Enter}`);
  await waitFor(() => expect(onFailureChange).toHaveBeenLastCalledWith(false));
});

async function startEditing(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
}

test('the Save and Cancel buttons appear only while editing', async () => {
  renderTitle(DocumentRole.Editor);
  expect(screen.queryByRole('button', { name: SAVE_TITLE_LABEL })).toBeNull();
  expect(screen.queryByRole('button', { name: CANCEL_TITLE_LABEL })).toBeNull();
  await startEditing();
  expect(screen.getByRole('button', { name: SAVE_TITLE_LABEL })).toBeVisible();
  expect(screen.getByRole('button', { name: CANCEL_TITLE_LABEL })).toBeVisible();
});

test('Save is disabled while the title is blank or unchanged', async () => {
  renderTitle(DocumentRole.Editor);
  await startEditing();
  expect(screen.getByRole('button', { name: SAVE_TITLE_LABEL })).toBeDisabled();
  await userEvent.keyboard('{Backspace}');
  expect(screen.getByRole('button', { name: SAVE_TITLE_LABEL })).toBeDisabled();
  await userEvent.keyboard(RENAMED_TITLE);
  expect(screen.getByRole('button', { name: SAVE_TITLE_LABEL })).toBeEnabled();
});

test('Save renames, closes the input and returns focus to the title button', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  renderTitle(DocumentRole.Editor);
  await startEditing();
  await userEvent.keyboard(RENAMED_TITLE);
  await userEvent.click(screen.getByRole('button', { name: SAVE_TITLE_LABEL }));
  await waitFor(() => expect(patchRequests(fetchSpy)).toHaveLength(1));
  const [, init] = patchRequests(fetchSpy)[0] as [string, RequestInit];
  expect(init.body).toBe(JSON.stringify({ title: RENAMED_TITLE }));
  expect(screen.queryByRole('textbox', { name: TITLE_LABEL })).toBeNull();
  await waitFor(() => expect(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) })).toHaveFocus());
});

test('Cancel restores the previous title, sends nothing and focuses the title button', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderTitle(DocumentRole.Editor);
  await startEditing();
  await userEvent.keyboard(RENAMED_TITLE);
  await userEvent.click(screen.getByRole('button', { name: CANCEL_TITLE_LABEL }));
  expect(screen.queryByRole('textbox', { name: TITLE_LABEL })).toBeNull();
  expect(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) })).toHaveFocus();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('blur alone neither saves nor closes the input', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderTitle(DocumentRole.Editor);
  await startEditing();
  await userEvent.keyboard(RENAMED_TITLE);
  await userEvent.click(document.body);
  expect(screen.getByRole('textbox', { name: TITLE_LABEL })).toHaveValue(RENAMED_TITLE);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the title reports dirty only while the input holds a changed value', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  const onDirtyChange = vi.fn();
  renderTitle(DocumentRole.Editor, vi.fn(), onDirtyChange);
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  await userEvent.keyboard(RENAMED_TITLE);
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  await userEvent.click(screen.getByRole('button', { name: CANCEL_TITLE_LABEL }));
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});

test('saving a changed title ends the dirty report', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  const onDirtyChange = vi.fn();
  renderTitle(DocumentRole.Owner, vi.fn(), onDirtyChange);
  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  await userEvent.keyboard(`${RENAMED_TITLE}{Enter}`);
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  expect(onDirtyChange).toHaveBeenCalledWith(true);
});

test('a reader title is never dirty', () => {
  const onDirtyChange = vi.fn();
  renderTitle(DocumentRole.Reader, vi.fn(), onDirtyChange);
  expect(onDirtyChange).not.toHaveBeenCalledWith(true);
});

test('a disabled Save is described by its reason, and an enabled Save is not', async () => {
  renderTitle(DocumentRole.Editor);
  await startEditing();
  const saveButton = screen.getByRole('button', { name: SAVE_TITLE_LABEL });
  expect(saveButton).toHaveAccessibleDescription(SAVE_TITLE_DISABLED_REASON);
  await userEvent.keyboard(RENAMED_TITLE);
  expect(saveButton).not.toHaveAttribute('aria-describedby');
  expect(screen.queryByText(SAVE_TITLE_DISABLED_REASON)).toBeNull();
});

test('Save and Cancel are icon-only buttons with their labels as accessible names', async () => {
  renderTitle(DocumentRole.Editor);
  await startEditing();
  const saveButton = screen.getByRole('button', { name: SAVE_TITLE_LABEL });
  const cancelButton = screen.getByRole('button', { name: CANCEL_TITLE_LABEL });
  [saveButton, cancelButton].forEach((button) => {
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button).toHaveClass('size-8', 'shrink-0');
  });
});

test('the editing row keeps one flex line with a shrinking input and nothing positioned over the header', async () => {
  renderTitle(DocumentRole.Editor);
  await startEditing();
  const input = screen.getByRole('textbox', { name: TITLE_LABEL });
  const row = input.closest('form') as HTMLFormElement;
  expect(row).toHaveClass('flex', 'min-w-0', 'items-center');
  expect(row).not.toHaveClass('flex-wrap');
  expect(input).toHaveClass('min-w-0', 'h-8');
  const reason = screen.getByText(SAVE_TITLE_DISABLED_REASON);
  expect(reason).toHaveClass('sr-only');
  expect(reason.className).not.toMatch(/sm:/);
});

test('a disabled Save shows its reason in a tooltip', async () => {
  renderTitle(DocumentRole.Editor);
  await startEditing();
  await userEvent.hover(screen.getByRole('button', { name: SAVE_TITLE_LABEL }).parentElement as HTMLElement);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(SAVE_TITLE_DISABLED_REASON);
});

test('an enabled Save shows its Enter hint and not the reason', async () => {
  renderTitle(DocumentRole.Editor);
  await startEditing();
  await userEvent.keyboard(RENAMED_TITLE);
  await userEvent.hover(screen.getByRole('button', { name: SAVE_TITLE_LABEL }).parentElement as HTMLElement);
  const tooltip = await screen.findByRole('tooltip');
  expect(pillTexts(tooltip)).toEqual(['Enter']);
  expect(tooltip).not.toHaveTextContent(SAVE_TITLE_DISABLED_REASON);
});

test('Cancel shows its Esc hint', async () => {
  renderTitle(DocumentRole.Editor);
  await startEditing();
  await userEvent.hover(screen.getByRole('button', { name: CANCEL_TITLE_LABEL }));
  expect(pillTexts(await screen.findByRole('tooltip'))).toEqual(['Esc']);
});

test('it reports when editing starts and stops', async () => {
  const onEditingChange = vi.fn();
  renderTitle(DocumentRole.Editor, vi.fn(), vi.fn(), onEditingChange);
  expect(onEditingChange).toHaveBeenLastCalledWith(false);
  await startEditing();
  expect(onEditingChange).toHaveBeenLastCalledWith(true);
  await userEvent.click(screen.getByRole('button', { name: CANCEL_TITLE_LABEL }));
  expect(onEditingChange).toHaveBeenLastCalledWith(false);
});
