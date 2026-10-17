export type NewDocumentState = { isNewDocument: true };

export const NEW_DOCUMENT_STATE: NewDocumentState = { isNewDocument: true };

export function isNewDocumentState(state: unknown): state is NewDocumentState {
  return typeof state === 'object' && state !== null && 'isNewDocument' in state;
}
