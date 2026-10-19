import { useState } from 'react';

export enum DocumentsView {
  Cards = 'cards',
  Table = 'table',
}

export const DOCUMENTS_VIEW_STORAGE_KEY = 'superdoc-collab.documents-view';

const DEFAULT_DOCUMENTS_VIEW = DocumentsView.Cards;

export function isDocumentsView(value: unknown): value is DocumentsView {
  return Object.values(DocumentsView).some((view) => view === value);
}

function readStoredView(): DocumentsView {
  try {
    const stored = localStorage.getItem(DOCUMENTS_VIEW_STORAGE_KEY);
    if (isDocumentsView(stored)) return stored;
    if (stored !== null) localStorage.removeItem(DOCUMENTS_VIEW_STORAGE_KEY);
    return DEFAULT_DOCUMENTS_VIEW;
  } catch {
    return DEFAULT_DOCUMENTS_VIEW;
  }
}

function writeStoredView(view: DocumentsView): void {
  try {
    localStorage.setItem(DOCUMENTS_VIEW_STORAGE_KEY, view);
  } catch {
    return;
  }
}

export function useDocumentsView(): { view: DocumentsView; chooseView: (view: DocumentsView) => void } {
  const [view, setView] = useState(readStoredView);

  function chooseView(next: DocumentsView): void {
    writeStoredView(next);
    setView(next);
  }

  return { view, chooseView };
}
