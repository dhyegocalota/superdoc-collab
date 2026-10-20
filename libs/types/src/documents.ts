import { z } from 'zod';
import type { AuthorColorSlot } from './author-colors';
import {
  BYTES_PER_KILOBYTE,
  BOOTSTRAP_MS_PER_MEGABYTE,
  BOOTSTRAP_STATE_BYTES_RATIO,
  BOOTSTRAP_TIMEOUT_FLOOR_MS,
  BOOTSTRAP_TIMEOUT_MARGIN,
  MINUTE_MS,
  SECOND_MS,
} from './constants';

export const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;
export const TITLE_MAX_LENGTH = 200;
export const PREVIEW_MAX_CHARACTERS = 400;

export const MAX_UPLOAD_MEGABYTES = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MEGABYTES * BYTES_PER_MEGABYTE;
export function bootstrapTimeoutMsOf(documentXmlBytes: number): number {
  return BOOTSTRAP_TIMEOUT_FLOOR_MS + (documentXmlBytes / BYTES_PER_MEGABYTE) * BOOTSTRAP_MS_PER_MEGABYTE * BOOTSTRAP_TIMEOUT_MARGIN;
}
export const BOOTSTRAP_HOST_TIMEOUT_MARGIN_MS = 10 * SECOND_MS;
const SOCKET_MESSAGE_UPLOAD_MULTIPLE = 8;
export const MAX_SOCKET_MESSAGE_BYTES = SOCKET_MESSAGE_UPLOAD_MULTIPLE * MAX_UPLOAD_BYTES;
export const MAX_DOCUMENT_XML_MEGABYTES = Math.floor(MAX_SOCKET_MESSAGE_BYTES / BYTES_PER_MEGABYTE / BOOTSTRAP_STATE_BYTES_RATIO);
export const MAX_DOCUMENT_XML_BYTES = MAX_DOCUMENT_XML_MEGABYTES * BYTES_PER_MEGABYTE;
export const BOOTSTRAP_HOST_TIMEOUT_MS = bootstrapTimeoutMsOf(MAX_DOCUMENT_XML_BYTES) + BOOTSTRAP_HOST_TIMEOUT_MARGIN_MS;
export const BOOTSTRAP_LIGHT_MAX_BYTES = 2 * BYTES_PER_MEGABYTE;
export const BOOTSTRAP_RESIDENT_BYTES_PER_XML_BYTE = 520;
export const BOOTSTRAP_MEMORY_RESERVE_MEGABYTES = 512;
const BOOTSTRAP_MEMORY_NONE_MESSAGE = 'This server has too little memory to prepare documents.';
const LIGHT_LANE_RESIDENT_MEGABYTES = (BOOTSTRAP_LIGHT_MAX_BYTES / BYTES_PER_MEGABYTE) * BOOTSTRAP_RESIDENT_BYTES_PER_XML_BYTE;
function usableMegabytesOf(memoryLimitMegabytes: number): number {
  return memoryLimitMegabytes - BOOTSTRAP_MEMORY_RESERVE_MEGABYTES;
}
export function largestPreparableMegabytes(memoryLimitMegabytes: number): number {
  const usableMegabytes = usableMegabytesOf(memoryLimitMegabytes);
  const lightMegabytes = Math.min(
    Math.floor(usableMegabytes / BOOTSTRAP_RESIDENT_BYTES_PER_XML_BYTE),
    BOOTSTRAP_LIGHT_MAX_BYTES / BYTES_PER_MEGABYTE,
  );
  const heavyMegabytes = Math.floor((usableMegabytes - LIGHT_LANE_RESIDENT_MEGABYTES) / BOOTSTRAP_RESIDENT_BYTES_PER_XML_BYTE);
  return Math.max(0, lightMegabytes, heavyMegabytes);
}
export function isPreparable({
  documentXmlBytes,
  memoryLimitMegabytes,
}: {
  documentXmlBytes: number;
  memoryLimitMegabytes: number;
}): boolean {
  const residentMegabytes = (documentXmlBytes / BYTES_PER_MEGABYTE) * BOOTSTRAP_RESIDENT_BYTES_PER_XML_BYTE;
  const usableMegabytes = usableMegabytesOf(memoryLimitMegabytes);
  if (bootstrapLaneOf(documentXmlBytes) === BootstrapLane.Light) return residentMegabytes <= usableMegabytes;
  return residentMegabytes <= usableMegabytes - LIGHT_LANE_RESIDENT_MEGABYTES;
}
export function bootstrapMemoryShortMessage(largestMegabytes: number): string {
  if (largestMegabytes === 0) return BOOTSTRAP_MEMORY_NONE_MESSAGE;
  return `This server can prepare documents with up to ${largestMegabytes} MB of text and layout.`;
}
export const BOOTSTRAP_QUEUE_RETRY_AFTER_MS = 5 * SECOND_MS;
export const UPLOADS_PER_MINUTE = 30;
export const MAX_REVISIONS_IMPORT_BYTES = 2 * BYTES_PER_MEGABYTE;
export const LARGE_ROOM_STATE_BYTES = 16 * BYTES_PER_MEGABYTE;
export const MAX_BOOTSTRAP_WAIT_MS = 5 * MINUTE_MS;
export const HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE = 19;
export const MAX_HEAVY_ROOMS_PER_USER = 2;
export const MAX_HEAVY_CONVERSIONS_PER_HOUR = 6;
export const SMALL_ROOMS_HEAP_SHARE = 0.25;
export const BOOTSTRAP_CONVERSION_RESIDENT_MEGABYTES = 2300;
export const SERVER_HEAP_BASELINE_MEGABYTES = 100;
export const ROOM_LOAD_SPIKE_HEAP_MEGABYTES = 900;
export function roomHeapMegabytesOf(stateBytes: number): number {
  return (stateBytes * HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE) / BYTES_PER_MEGABYTE;
}
export function roomHeapBudgetMegabytes({
  memoryLimitMegabytes,
  serverHeapMegabytes,
}: {
  memoryLimitMegabytes: number | null;
  serverHeapMegabytes: number | null;
}): number | null {
  const containerBudget =
    memoryLimitMegabytes === null ? null : usableMegabytesOf(memoryLimitMegabytes) - BOOTSTRAP_CONVERSION_RESIDENT_MEGABYTES;
  const heapBudget =
    serverHeapMegabytes === null ? null : serverHeapMegabytes - SERVER_HEAP_BASELINE_MEGABYTES - ROOM_LOAD_SPIKE_HEAP_MEGABYTES;
  const budgets = [containerBudget, heapBudget].filter((budget): budget is number => budget !== null);
  if (budgets.length === 0) return null;
  return Math.max(0, Math.min(...budgets));
}
export function largestHoldableMegabytes(roomHeapBudgetMegabytes: number): number {
  throw new Error(`largestHoldableMegabytes is not implemented for ${roomHeapBudgetMegabytes}`);
}
const ROOM_HOLD_NONE_MESSAGE = 'This server has no memory to hold a document that needs a heavy room, even prepared on a device.';
export function roomHoldShortMessage(largestMegabytes: number): string {
  if (largestMegabytes === 0) return ROOM_HOLD_NONE_MESSAGE;
  return `This server cannot hold a document this large at its current memory, even prepared on a device. The largest it can hold has up to ${largestMegabytes} MB of text and layout.`;
}
export function isHeavyRoomDocument(documentXmlBytes: number): boolean {
  return documentXmlBytes * BOOTSTRAP_STATE_BYTES_RATIO > LARGE_ROOM_STATE_BYTES;
}
export function bootstrapBusyMessage(waitMs: number): string {
  return `The server is busy preparing other documents; try again in about ${Math.max(1, Math.ceil(waitMs / MINUTE_MS))} min`;
}
export const HEAVY_ROOMS_RETRY_AFTER_MS = MINUTE_MS;
export const HEAVY_ROOMS_FULL_CLOSE_CODE = 4503;
export const HEAVY_ROOMS_FULL_REASON = 'Heavy rooms full';
export const HEAVY_ROOMS_USER_CAP_REASON = 'Heavy rooms user cap';
export const HEAVY_ROOMS_USER_CAP_CLOSE_CODE = 4504;
export const HEAVY_ROOMS_USER_CAP_MESSAGE = `You already have ${MAX_HEAVY_ROOMS_PER_USER} large documents open. Close one to open another.`;
export enum HeavyRoomsRefusal {
  Full = 'full',
  UserCap = 'user-cap',
}
export const HEAVY_ROOMS_FULL_SHORT_MESSAGE = 'Too many large documents are open.';
export const HEAVY_ROOMS_FULL_MESSAGE = 'The server is holding as many large documents as it can; try again in a few minutes';
export const LARGE_DOCUMENT_HEAP_BYTES = 256 * BYTES_PER_MEGABYTE;
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOCX_EXTENSION = '.docx';
export const UPLOAD_FIELD = 'file';
export const PREPARATION_FIELD = 'preparation';
export const DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES = 4;
export const DEVICE_JOB_LIFETIME_MS = BOOTSTRAP_HOST_TIMEOUT_MS;
export const UPLOAD_TOO_LARGE_MESSAGE = `Files up to ${MAX_UPLOAD_MEGABYTES} MB can be uploaded.`;
export const NOT_A_DOCX_MESSAGE = 'Only .docx files can be uploaded.';
export const DOCUMENT_TOO_LARGE_MESSAGE = `Documents with more than ${MAX_DOCUMENT_XML_MEGABYTES} MB of text and layout cannot be opened.`;
export const INVALID_PREPARATION_MESSAGE = 'The preparation source is not valid.';
export const UPLOAD_RATE_LIMITED_MESSAGE = 'Too many uploads in a minute';
export const BOOTSTRAP_QUEUE_FULL_MESSAGE = 'You already have a document being prepared and another waiting. Try again when one finishes.';
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

export enum PreparationSource {
  Server = 'server',
  Device = 'device',
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
  preparedOnDeviceOf: string | null;
  colorSlot: AuthorColorSlot;
};
export type UploadRefusal = { error: string; canPrepareOnDevice: boolean };
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

export function bootstrapLaneOf(documentXmlBytes: number): BootstrapLane {
  if (documentXmlBytes <= BOOTSTRAP_LIGHT_MAX_BYTES) return BootstrapLane.Light;
  return BootstrapLane.Heavy;
}

export type BootstrapProgress = {
  stage: BootstrapStage;
  done: number;
  total: number;
  stateBytes: number | null;
  estimatedMs: number | null;
  documentXmlBytes: number;
  preparingElapsedMs: number | null;
  queuePosition: number | null;
  queueWaitMs: number | null;
};
