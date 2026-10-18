import { z } from 'zod';

const BYTES_PER_MEGABYTE = 1024 * 1024;
export const TITLE_MAX_LENGTH = 200;

export const MAX_UPLOAD_MEGABYTES = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MEGABYTES * BYTES_PER_MEGABYTE;
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOCX_EXTENSION = '.docx';
export const UPLOAD_FIELD = 'file';
export const UPLOAD_TOO_LARGE_MESSAGE = `Files up to ${MAX_UPLOAD_MEGABYTES} MB can be uploaded.`;
export const NOT_A_DOCX_MESSAGE = 'Only .docx files can be uploaded.';
export const INVALID_SHARE_LINK_MESSAGE = 'This link is no longer valid.';
export const UNTITLED_DOCUMENT_TITLE = 'Untitled document';
export const COLLABORATION_TOKEN_PLACEHOLDER = 'session-cookie';
export const DOCUMENT_NOT_READY_ERROR = 'NOT_READY';
export const DOCUMENT_UNAVAILABLE_MESSAGE = 'This document is no longer available.';
export const READ_ONLY_BADGE_LABEL = 'Read only';
export const LINK_COPIED_MESSAGE = 'Link copied';

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
export type DocumentSummary = { id: string; title: string; owner: UserReference; updatedAt: number; role: DocumentRole };
export type DocumentsList = { mine: DocumentSummary[]; shared: DocumentSummary[] };
export type OpenedDocument = { document: DocumentSummary; role: DocumentRole; roomMode: RoomMode };
export type DocumentMember = { user: UserReference; role: DocumentRole; online: boolean };
export type DocumentMembers = { members: DocumentMember[]; isCurrentUserOnline: boolean };
export type ShareLinks = Record<ShareLinkRole, string>;
export type AcceptedShareLink = { documentId: string };
