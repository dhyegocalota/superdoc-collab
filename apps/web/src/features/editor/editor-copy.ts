import { ShareLinkRole } from '@superdoc-history/types';

export const TITLE_LABEL = 'Title';
export const SHARE_LABEL = 'Share';
export const DELETE_LABEL = 'Delete';
export const DELETE_CONFIRM_LABEL = 'Delete document';
export const DELETE_DIALOG_TITLE = 'Delete this document?';
export const DELETE_DIALOG_DESCRIPTION = 'The document and its history are removed for everyone.';
export const DOWNLOAD_LABEL = 'Download .docx';
export const BACK_TO_DOCUMENTS_LABEL = 'Back to documents';
export const ONLINE_LABEL = 'online';
export const COPY_LABEL = 'Copy';
export const ROTATE_LABEL = 'Rotate';
export const SHARE_DIALOG_TITLE = 'Share this document';
export const SHARE_DIALOG_DESCRIPTION = 'Anyone signed in with a link joins with that link’s access.';
export const TIMELINE_TOGGLE_LABEL = 'Toggle timeline';
export const DOCUMENT_LOAD_ERROR_MESSAGE = 'The document could not be loaded.';

export const SHARE_LINK_LABELS: Record<ShareLinkRole, string> = {
  [ShareLinkRole.Edit]: 'Edit link',
  [ShareLinkRole.Read]: 'Read-only link',
};
