import {
  type BootstrapProgress,
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

export const STATE_BYTES = 36_500_000;
export const READY_BOOTSTRAP: BootstrapProgress = {
  stage: BootstrapStage.Ready,
  done: 0,
  total: 0,
  stateBytes: STATE_BYTES,
  estimatedMs: null,
  fileBytes: 0,
  preparingElapsedMs: null,
};

export function bootstrapAt(stage: BootstrapStage): BootstrapProgress {
  return { ...READY_BOOTSTRAP, stage };
}

export function openedAs(role: DocumentRole, roomMode = RoomMode.Create): OpenedDocument {
  return {
    document: summaryAs(role),
    role,
    roomMode,
    colorSlot: EDITOR_COLOR_SLOT,
    bootstrap: READY_BOOTSTRAP,
  };
}
