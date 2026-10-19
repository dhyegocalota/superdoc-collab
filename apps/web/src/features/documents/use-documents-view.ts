export enum DocumentsView {
  Cards = 'cards',
  Table = 'table',
}

export const DOCUMENTS_VIEW_STORAGE_KEY = 'superdoc-collab.documents-view';

export function isDocumentsView(value: unknown): value is DocumentsView {
  return Object.values(DocumentsView).some((view) => view === value);
}

export function useDocumentsView(): { view: DocumentsView; chooseView: (view: DocumentsView) => void } {
  throw new Error('useDocumentsView is not implemented');
}
