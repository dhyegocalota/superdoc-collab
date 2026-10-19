import { InviteState, UserRole } from '@superdoc-collab/types';

export const ADMIN_LINK_LABEL = 'Admin';
export const ADMIN_HEADING = 'Admin';
export const ADMINS_ONLY_TOAST = 'Admins only';
export const USERS_HEADING = 'Users';
export const INVITES_HEADING = 'Invites';
export const USERS_TABLE_LABEL = 'Users';
export const INVITES_TABLE_LABEL = 'Invites';
export const GENERATE_INVITE_LABEL = 'Generate invite';
export const INVITE_CREATED_TITLE = 'Invite link';
export const INVITE_CREATED_DESCRIPTION = 'Send this link to one person. It works once and expires in seven days. It is shown only now.';
export const RESET_PASSWORD_LABEL = 'Reset password';
export const PASSWORD_RESET_CREATED_TITLE = 'Password reset link';
export const PASSWORD_RESET_CREATED_DESCRIPTION =
  'Send this link to the person. It works once and expires in one hour. It is shown only now.';
export const PASSWORD_RESET_COPIED_TOAST = 'Password reset link copied';
export const SHOWCASE_BUTTON_LABEL = 'Create the showcase document';
export const SHOWCASE_DESCRIPTION =
  'Adds a sample document with five days of edits by four authors. Pressing it again creates a second document.';
export const SHOWCASE_CREATED_TOAST = 'Showcase document created';
export const COPY_LINK_LABEL = 'Copy link';
export const INVITE_COPIED_TOAST = 'Invite link copied';
export const COPY_FAILED_MESSAGE = 'Copy failed. Select the link and copy it.';
export const REVOKE_LABEL = 'Revoke';
export const MAKE_ADMIN_LABEL = 'Make admin';
export const MAKE_USER_LABEL = 'Make user';
export const ACTION_FAILED_MESSAGE = 'That did not work. Try again.';
export const NO_INVITES_MESSAGE = 'No invites yet.';
export const NOT_ACCEPTED_LABEL = '—';
export const ADMIN_USERS_SUBJECT = 'Users request';
export const INVITES_SUBJECT = 'Invites request';
export const CREATE_INVITE_SUBJECT = 'Create invite';
export const REVOKE_INVITE_SUBJECT = 'Revoke invite';
export const SET_ROLE_SUBJECT = 'Set role';
export const CREATE_PASSWORD_RESET_SUBJECT = 'Create password reset';
export const CREATE_SHOWCASE_SUBJECT = 'Create showcase';

export const USERS_COLUMN_LABELS: string[] = ['Name', 'Email', 'Role', 'Joined', 'Actions'];
export const INVITES_COLUMN_LABELS: string[] = ['State', 'Created', 'Expires', 'Created by', 'Accepted by', 'Actions'];

export const INVITE_STATE_LABELS: Record<InviteState, string> = {
  [InviteState.Pending]: 'Pending',
  [InviteState.Accepted]: 'Accepted',
  [InviteState.Revoked]: 'Revoked',
  [InviteState.Expired]: 'Expired',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.Admin]: 'Admin',
  [UserRole.User]: 'User',
};

export const ADMIN_LOAD_ERROR_MESSAGE = 'The admin data could not be loaded.';

export const ARCHIVE_LABEL = 'Archive';
export const RESTORE_LABEL = 'Restore';
export const IMPERSONATE_LABEL = 'Impersonate';
export const ARCHIVED_CHIP_LABEL = 'Archived';
export const CANCEL_LABEL = 'Cancel';
export const ARCHIVE_DIALOG_DESCRIPTION =
  'They are signed out now, cannot sign in and lose their connected apps. Their documents and history stay. You can restore them later.';
export const ARCHIVE_USER_SUBJECT = 'Archive user';
export const RESTORE_USER_SUBJECT = 'Restore user';
export const IMPERSONATE_USER_SUBJECT = 'Impersonate user';

export function archiveDialogTitle(name: string): string {
  return `Archive ${name}?`;
}

export function actionsMenuLabel(name: string): string {
  return `Actions for ${name}`;
}
