import {
  BootstrapStage,
  DocumentRole,
  RoomMode,
  UserRole,
  type DocumentSummary,
  type OpenedDocument,
  type SessionUser,
} from '@superdoc-collab/types';

export const DOCUMENT_ID = 'doc-1';
export const DOCUMENT_TITLE = 'Plan';
export const EDITOR_COLOR_SLOT = 1;
export const EDITOR_USER = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };
export const SESSION_USER: SessionUser = { ...EDITOR_USER, role: UserRole.User, timeZone: 'UTC', impersonatedBy: null };

export function summaryAs(role: DocumentRole): DocumentSummary {
  return {
    id: DOCUMENT_ID,
    title: DOCUMENT_TITLE,
    owner: { id: SESSION_USER.id, name: SESSION_USER.name },
    updatedAt: 1,
    role,
    preview: null,
    thumbnailUpdatedAt: null,
  };
}

const READY_BOOTSTRAP = { stage: BootstrapStage.Ready, done: 0, total: 0, stateBytes: null };

export function openedAs(role: DocumentRole, roomMode = RoomMode.Create): OpenedDocument {
  return {
    document: summaryAs(role),
    role,
    roomMode,
    creatorAttempt: null,
    creatorEpoch: null,
    bootstrap: READY_BOOTSTRAP,
    colorSlot: EDITOR_COLOR_SLOT,
  };
}
