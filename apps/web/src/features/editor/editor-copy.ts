import { ShareLinkRole } from '@superdoc-collab/types';
import { APP_NAME } from '../../lib/app-copy';
import { DownloadFormat } from './download-format';

export const TITLE_LABEL = 'Title';
export const SAVE_TITLE_LABEL = 'Save';
export const CANCEL_TITLE_LABEL = 'Cancel';
export const SAVE_TITLE_DISABLED_REASON = 'Type a different title to save';
export const SHARE_LABEL = 'Share';
export const DELETE_LABEL = 'Delete';
export const MORE_ACTIONS_LABEL = 'More actions';
export const DELETE_CONFIRM_LABEL = 'Delete document';
export const DELETE_DIALOG_TITLE = 'Delete this document?';
export const DELETE_DIALOG_DESCRIPTION = 'The document and its history are removed for everyone.';
export const DOWNLOAD_LABEL = 'Download .docx';
export const FIND_IN_DOCUMENT_LABEL = 'Find in document';
export const DOWNLOAD_BUTTON_LABEL = 'Download';
export const DOWNLOAD_OPTIONS_LABEL = 'More download formats';
export const DOWNLOAD_PDF_LABEL = 'Download PDF';
export const PREPARING_PDF_MESSAGE = 'Preparing the PDF…';
export const PDF_FAILED_MESSAGE = 'The PDF could not be prepared.';
export const PDF_PRINT_HINT = 'Choose “Save as PDF” in the print dialog.';
export const DOWNLOAD_FORMAT_LABELS: Record<DownloadFormat, string> = {
  [DownloadFormat.Docx]: DOWNLOAD_LABEL,
  [DownloadFormat.Pdf]: DOWNLOAD_PDF_LABEL,
};
export const SELF_MEMBER_REASON = 'This is you';
export const BACK_TO_LIVE_TO_JUMP_REASON = 'Go back to live to jump to a cursor';
export const BACK_TO_DOCUMENTS_LABEL = 'Back to documents';
const ONLINE_LABEL = 'online';
export const COPY_LABEL = 'Copy';
export const RESET_LINK_LABEL = 'Reset link';
export const CANCEL_LABEL = 'Cancel';
export const SHARE_DIALOG_TITLE = 'Share this document';
export const SHARE_DIALOG_DESCRIPTION =
  'Anyone signed in with a link joins with that link’s access. Resetting a link stops the old one from working.';
export const TIMELINE_TOGGLE_LABEL = 'Edits panel';
export const DOCUMENT_LOAD_ERROR_MESSAGE = 'The document could not be loaded.';
export const LOADING_DOCUMENT_MESSAGE = 'Loading document…';
export const EXPORT_FAILED_MESSAGE = 'The document could not be exported.';
export const EDITOR_FAILED_MESSAGE = 'The editor stopped working. Reload the page to continue.';
export const EDIT_REJECTED_MESSAGE =
  'That edit could not be applied. The text may have changed under you. Click where you want to type and try again.';
export const EDITOR_ESCAPE_HINT = 'Press Escape to leave the editor.';
export const EDITOR_EXIT_LABEL = 'End of the editor';
export const SHARE_OPENING_MESSAGE = 'Opening…';
export const ACCEPT_LINK_SUBJECT = 'Accepting the link';
export const RENAME_FAILED_MESSAGE = 'The title could not be saved.';
export const DELETE_FAILED_MESSAGE = 'The document could not be deleted.';
export const RESET_FAILED_MESSAGE = 'The link could not be reset.';
export const COPY_FAILED_MESSAGE = 'The link could not be copied. It is selected, so copy it with your keyboard.';
export const LOADING_SHARE_LINKS_LABEL = 'Loading links';
export const SHARE_LINKS_LOAD_ERROR_MESSAGE = 'The links could not be loaded.';
export const LOADING_MEMBERS_LABEL = 'Loading people';
export const MEMBERS_LOAD_ERROR_MESSAGE = 'The people with access could not be loaded.';
export const REMOVE_LABEL = 'Remove';
export const PEOPLE_WITH_ACCESS_LABEL = 'People with access';
export const REMOVE_FAILED_MESSAGE = 'That person could not be removed.';

export const SHARE_LINK_LABELS: Record<ShareLinkRole, string> = {
  [ShareLinkRole.Edit]: 'Edit link',
  [ShareLinkRole.Read]: 'Read-only link',
};
export const HIGHLIGHT_COMMENT_TEXT = 'Edited in this period';
export const HOME_LINK_LABEL = `${APP_NAME}, back to documents`;

export function memberLabel(name: string): string {
  return `${name}, ${ONLINE_LABEL}`;
}

export function removeMemberLabel(name: string): string {
  return `Remove ${name}`;
}

export function renameTitleLabel(title: string): string {
  return `Rename ${title}`;
}

export function goToCursorLabel(name: string): string {
  return `Go to ${name}’s cursor`;
}

export function movedToCursorMessage(name: string): string {
  return `Moved to ${name}’s cursor.`;
}

export function cursorNotFoundMessage(name: string): string {
  return `${name}’s cursor could not be found.`;
}

export function onlineMembersLabel(count: number): string {
  return `${count} online`;
}

export function cursorOffScreenReason(name: string): string {
  return `${name}’s cursor is off screen`;
}

export function moreMembersLabel(count: number): string {
  return `${count} more people`;
}

export const EXIT_CONFIRMATION_TITLE = 'Leave without your latest edits?';
export const EXIT_CONFIRMATION_DESCRIPTION =
  'Edits made while the connection was down have not reached the server yet. Download the document first to keep them.';
export const STAY_LABEL = 'Stay';
export const LEAVE_LABEL = 'Leave';

export const ADD_COMMENT_TITLE = 'Add comment';
export const ADD_COMMENT_DESCRIPTION = 'The comment is attached to the selected text, or to the caret when nothing is selected.';
export const COMMENT_TEXT_LABEL = 'Comment';
export const ADD_COMMENT_SUBMIT_LABEL = 'Comment';
export const ADD_COMMENT_FAILED_MESSAGE = 'The comment could not be added.';
