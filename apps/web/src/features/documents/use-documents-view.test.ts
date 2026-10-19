import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DOCUMENTS_VIEW_STORAGE_KEY, DocumentsView, useDocumentsView } from './use-documents-view';

const UNKNOWN_VALUE = 'gallery';

beforeEach(() => localStorage.clear());

afterEach(() => vi.restoreAllMocks());

test('with nothing stored the view is cards', () => {
  const { result } = renderHook(() => useDocumentsView());
  expect(result.current.view).toBe(DocumentsView.Cards);
});

test('a stored table choice is used', () => {
  localStorage.setItem(DOCUMENTS_VIEW_STORAGE_KEY, DocumentsView.Table);
  const { result } = renderHook(() => useDocumentsView());
  expect(result.current.view).toBe(DocumentsView.Table);
});

test('a stored value that is not a view is removed and cards is used', () => {
  localStorage.setItem(DOCUMENTS_VIEW_STORAGE_KEY, UNKNOWN_VALUE);
  const { result } = renderHook(() => useDocumentsView());
  expect(result.current.view).toBe(DocumentsView.Cards);
  expect(localStorage.getItem(DOCUMENTS_VIEW_STORAGE_KEY)).toBeNull();
});

test('choosing a view switches it and stores it', () => {
  const { result } = renderHook(() => useDocumentsView());
  act(() => result.current.chooseView(DocumentsView.Table));
  expect(result.current.view).toBe(DocumentsView.Table);
  expect(localStorage.getItem(DOCUMENTS_VIEW_STORAGE_KEY)).toBe(DocumentsView.Table);
});

test('without usable storage the default is used and a choice still switches the view', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  const { result } = renderHook(() => useDocumentsView());
  expect(result.current.view).toBe(DocumentsView.Cards);
  act(() => result.current.chooseView(DocumentsView.Table));
  expect(result.current.view).toBe(DocumentsView.Table);
});
