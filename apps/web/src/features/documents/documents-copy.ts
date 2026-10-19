import { DocumentRole, MAX_UPLOAD_MEGABYTES } from '@superdoc-collab/types';
import { DocumentColumn } from './document-columns';

export const MINE_HEADING = 'Mine';
export const SHARED_HEADING = 'Shared with me';
export const MINE_EMPTY_MESSAGE = 'No documents yet';
export const SHARED_EMPTY_MESSAGE = 'Nothing shared with you yet';
export const NEW_DOCUMENT_LABEL = 'New document';
export const UPLOAD_LABEL = 'Upload .docx';
export const UPLOAD_DIALOG_TITLE = 'Upload a document';
export const UPLOAD_DIALOG_DESCRIPTION = `Choose a .docx file up to ${MAX_UPLOAD_MEGABYTES} MB.`;
export const FILE_INPUT_LABEL = 'Document file';
export const DOCUMENTS_LOAD_ERROR_MESSAGE = 'Documents could not be loaded.';
export const UPLOAD_SUBJECT = 'Upload';
export const CREATE_SUBJECT = 'Create';
export const LIST_SUBJECT = 'Documents request';
export const CREATE_ERROR_MESSAGE = 'The document could not be created.';
export const DOCUMENTS_HEADING = 'Documents';
export const LOADING_DOCUMENTS_LABEL = 'Loading documents';
export const UPLOADING_MESSAGE = 'Uploading…';

export const ROLE_LABELS: Record<DocumentRole, string> = {
  [DocumentRole.Owner]: 'Owner',
  [DocumentRole.Editor]: 'Can edit',
  [DocumentRole.Reader]: 'Can view',
};

export const COLUMN_LABELS: Record<DocumentColumn, string> = {
  [DocumentColumn.Title]: 'Title',
  [DocumentColumn.Owner]: 'Owner',
  [DocumentColumn.Updated]: 'Updated',
  [DocumentColumn.Access]: 'Access',
};

export const DOCUMENT_DETAILS_SEPARATOR = ' · ';

export const EMPTY_STATE_HEADING = 'Start with a document';
export const EMPTY_STATE_DESCRIPTION =
  'Every edit by every author is kept, so you can step back through the timeline and see who changed what.';
export const DROP_ZONE_LABEL = 'Drop a .docx here, or choose a file';
export const DROP_ZONE_LIMIT = `Up to ${MAX_UPLOAD_MEGABYTES} MB`;
export const CHOOSE_FILE_LABEL = 'Choose a file';
export const DROP_OVERLAY_LABEL = 'Drop to upload';
export const ONE_FILE_AT_A_TIME_MESSAGE = 'Drop one file at a time.';

export const DOCUMENTS_VIEW_LABEL = 'Documents view';
export const CARDS_VIEW_LABEL = 'Cards';
export const TABLE_VIEW_LABEL = 'Table';
export const EDITED_JUST_NOW_LABEL = 'Edited just now';

export function editedAgoLabel(duration: string): string {
  return `Edited ${duration} ago`;
}
