import { z } from 'zod';
import type { AuthorColorSlot } from './author-colors';
import {
  BYTES_PER_KILOBYTE,
  BOOTSTRAP_MS_PER_MEGABYTE,
  BOOTSTRAP_TIMEOUT_FLOOR_MS,
  BOOTSTRAP_TIMEOUT_MARGIN,
  SECOND_MS,
} from './constants';

export const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;
export const TITLE_MAX_LENGTH = 200;
export const PREVIEW_MAX_CHARACTERS = 400;

export const MAX_UPLOAD_MEGABYTES = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MEGABYTES * BYTES_PER_MEGABYTE;
export function bootstrapTimeoutMsOf(fileBytes: number): number {
  return BOOTSTRAP_TIMEOUT_FLOOR_MS + (fileBytes / BYTES_PER_MEGABYTE) * BOOTSTRAP_MS_PER_MEGABYTE * BOOTSTRAP_TIMEOUT_MARGIN;
}
export const BOOTSTRAP_HOST_TIMEOUT_MARGIN_MS = 10 * SECOND_MS;
export const BOOTSTRAP_HOST_TIMEOUT_MS = bootstrapTimeoutMsOf(MAX_UPLOAD_BYTES) + BOOTSTRAP_HOST_TIMEOUT_MARGIN_MS;
export const MAX_DOCUMENT_XML_MEGABYTES = 64;
export const MAX_DOCUMENT_XML_BYTES = MAX_DOCUMENT_XML_MEGABYTES * BYTES_PER_MEGABYTE;
export const BOOTSTRAP_LIGHT_MAX_BYTES = 2 * BYTES_PER_MEGABYTE;
export const BOOTSTRAP_QUEUE_RETRY_AFTER_MS = 5 * SECOND_MS;
export const UPLOADS_PER_MINUTE = 30;
export const MAX_REVISIONS_IMPORT_BYTES = 2 * BYTES_PER_MEGABYTE;
export const LARGE_ROOM_STATE_BYTES = 16 * BYTES_PER_MEGABYTE;
export const LARGE_DOCUMENT_HEAP_BYTES = 256 * BYTES_PER_MEGABYTE;
const SOCKET_MESSAGE_UPLOAD_MULTIPLE = 8;
export const MAX_SOCKET_MESSAGE_BYTES = SOCKET_MESSAGE_UPLOAD_MULTIPLE * MAX_UPLOAD_BYTES;
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOCX_EXTENSION = '.docx';
export const UPLOAD_FIELD = 'file';
export const UPLOAD_TOO_LARGE_MESSAGE = `Files up to ${MAX_UPLOAD_MEGABYTES} MB can be uploaded.`;
export const NOT_A_DOCX_MESSAGE = 'Only .docx files can be uploaded.';
export const DOCUMENT_TOO_LARGE_MESSAGE = `Documents with more than ${MAX_DOCUMENT_XML_MEGABYTES} MB of text and layout cannot be opened.`;
export const UPLOAD_RATE_LIMITED_MESSAGE = 'Too many uploads in a minute';
export const BOOTSTRAP_QUEUE_FULL_MESSAGE = 'Another document of yours is still waiting to be prepared';
export const INVALID_SHARE_LINK_MESSAGE = 'This link is no longer valid.';
export const UNTITLED_DOCUMENT_TITLE = 'Untitled document';
export const COLLABORATION_TOKEN_PLACEHOLDER = 'session-cookie';
export const SUPERDOC_ROOM_PREFIX = 'sd2/v2.1/';
export const DOCUMENT_NOT_READY_ERROR = 'NOT_READY';
export const DOCUMENT_UNAVAILABLE_MESSAGE = 'This document is no longer available.';
export const READ_ONLY_BADGE_LABEL = 'Read only';
export const LINK_COPIED_MESSAGE = 'Link copied';
export const OWNER_ACCESS_CANNOT_BE_REMOVED_MESSAGE = 'The owner cannot be removed.';
export const MEMBER_NOT_FOUND_MESSAGE = 'This person does not have access.';

export enum DocumentRole {
  Owner = 'owner',
  Editor = 'editor',
  Reader = 'reader',
}

export enum ShareLinkRole {
  Edit = 'edit',
  Read = 'read',
}

export enum RoomMode {
  Create = 'create',
  Join = 'join',
}

export const DOCUMENT_ROLE_RANK: Record<DocumentRole, number> = {
  [DocumentRole.Reader]: 1,
  [DocumentRole.Editor]: 2,
  [DocumentRole.Owner]: 3,
};

export const SHARE_LINK_GRANTS: Record<ShareLinkRole, DocumentRole> = {
  [ShareLinkRole.Edit]: DocumentRole.Editor,
  [ShareLinkRole.Read]: DocumentRole.Reader,
};

export const titleSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX_LENGTH) });

export type UserReference = { id: string; name: string };
export type DocumentSummary = {
  id: string;
  title: string;
  owner: UserReference;
  updatedAt: number;
  role: DocumentRole;
  preview: string | null;
  thumbnailUpdatedAt: number | null;
};
export type DocumentsList = { mine: DocumentSummary[]; shared: DocumentSummary[] };
export type OpenedDocument = {
  document: DocumentSummary;
  role: DocumentRole;
  roomMode: RoomMode;
  bootstrap: BootstrapProgress;
  colorSlot: AuthorColorSlot;
};
export type DocumentMember = { user: UserReference; role: DocumentRole; online: boolean; colorSlot: AuthorColorSlot };
export type DocumentMembers = {
  members: DocumentMember[];
  isCurrentUserOnline: boolean;
};
export type ShareLinks = Record<ShareLinkRole, string>;
export type AcceptedShareLink = { documentId: string };

export enum BootstrapStage {
  Queued = 'queued',
  Preparing = 'preparing',
  Ready = 'ready',
  Failed = 'failed',
}

export enum BootstrapLane {
  Light = 'light',
  Heavy = 'heavy',
}

export function bootstrapLaneOf(fileBytes: number): BootstrapLane {
  if (fileBytes <= BOOTSTRAP_LIGHT_MAX_BYTES) return BootstrapLane.Light;
  return BootstrapLane.Heavy;
}

export type BootstrapProgress = {
  stage: BootstrapStage;
  done: number;
  total: number;
  stateBytes: number | null;
  estimatedMs: number | null;
  fileBytes: number;
  preparingSince: number | null;
};
