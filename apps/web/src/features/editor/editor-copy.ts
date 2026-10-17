import { ShareLinkRole } from '@superdoc-history/types';
import { APP_NAME } from '../../lib/app-copy';

export const TITLE_LABEL = 'Title';
export const SHARE_LABEL = 'Share';
export const DELETE_LABEL = 'Delete';
export const MORE_ACTIONS_LABEL = 'More actions';
export const DELETE_CONFIRM_LABEL = 'Delete document';
export const DELETE_DIALOG_TITLE = 'Delete this document?';
export const DELETE_DIALOG_DESCRIPTION = 'The document and its history are removed for everyone.';
export const DOWNLOAD_LABEL = 'Download .docx';
export const BACK_TO_DOCUMENTS_LABEL = 'Back to documents';
export const ONLINE_LABEL = 'online';
export const COPY_LABEL = 'Copy';
export const RESET_LINK_LABEL = 'Reset link';
export const CANCEL_LABEL = 'Cancel';
export const SHARE_DIALOG_TITLE = 'Share this document';
export const SHARE_DIALOG_DESCRIPTION =
  'Anyone signed in with a link joins with that link’s access. Resetting a link stops the old one from working.';
export const TIMELINE_TOGGLE_LABEL = 'Toggle timeline';
export const DOCUMENT_LOAD_ERROR_MESSAGE = 'The document could not be loaded.';
export const LOADING_DOCUMENT_MESSAGE = 'Loading document…';
export const EXPORT_FAILED_MESSAGE = 'The document could not be exported.';
export const EDITOR_FAILED_MESSAGE = 'The editor stopped working. Reload the page to continue.';
export const EDITOR_ESCAPE_HINT = 'Press Escape to leave the editor.';
export const EDITOR_EXIT_LABEL = 'End of the editor';
export const SHARE_OPENING_MESSAGE = 'Opening…';
export const ACCEPT_LINK_SUBJECT = 'Accepting the link';
export const RENAME_FAILED_MESSAGE = 'The title could not be saved.';
export const DELETE_FAILED_MESSAGE = 'The document could not be deleted.';
export const RESET_FAILED_MESSAGE = 'The link could not be reset.';
export const COPY_FAILED_MESSAGE = 'The link could not be copied. It is selected, so copy it with your keyboard.';
export const LOADING_SHARE_LINKS_LABEL = 'Loading links';

export const SHARE_LINK_LABELS: Record<ShareLinkRole, string> = {
  [ShareLinkRole.Edit]: 'Edit link',
  [ShareLinkRole.Read]: 'Read-only link',
};
export const HIGHLIGHT_COMMENT_TEXT = 'Edited in this period';
export const HOME_LINK_LABEL = `${APP_NAME}, back to documents`;

export function memberLabel({ name, isOnline }: { name: string; isOnline: boolean }): string {
  if (!isOnline) return name;
  return `${name}, ${ONLINE_LABEL}`;
}
