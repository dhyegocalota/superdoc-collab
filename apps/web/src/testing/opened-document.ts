import { DocumentRole, RoomMode, type DocumentSummary, type OpenedDocument } from '@superdoc-history/types';

export const DOCUMENT_ID = 'doc-1';
export const DOCUMENT_TITLE = 'Plan';
export const SESSION_USER = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };

export function summaryAs(role: DocumentRole): DocumentSummary {
  return { id: DOCUMENT_ID, title: DOCUMENT_TITLE, owner: { id: SESSION_USER.id, name: SESSION_USER.name }, updatedAt: 1, role };
}

export function openedAs(role: DocumentRole, roomMode = RoomMode.Create): OpenedDocument {
  return { document: summaryAs(role), role, roomMode };
}
