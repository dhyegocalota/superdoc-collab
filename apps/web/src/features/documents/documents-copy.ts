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
