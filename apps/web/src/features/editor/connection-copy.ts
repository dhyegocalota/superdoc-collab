import { ConnectionFailureReason, HEAVY_ROOMS_FULL_SHORT_MESSAGE } from '@superdoc-collab/types';

export const LOST_TITLE = 'You are offline.';
export const RECONNECTING_TITLE = 'Reconnecting…';
export const RECOVERED_TITLE = 'Back online';
export const FAILED_TITLE = 'Editing is paused: the connection failed.';
export const KEPT_AND_DATED_DETAIL = 'Your edits stay in this browser and are dated when they sync.';
export const UNSYNCED_LOST_ON_RELOAD_DETAIL = 'Unsynced edits are lost on reload. Download first to keep them.';
export const UNSYNCED_LOST_ON_SIGN_IN_DETAIL = 'Unsynced edits are lost on sign-in. Download first to keep them.';
export const RELOAD_LABEL = 'Reload';
export const SIGN_IN_LABEL = 'Sign in';
export const RELOADING_LABEL = 'Reloading…';
export const RELOAD_FAILED_MESSAGE = 'The server could not be reached. Try again.';

export const FAILURE_REASON_COPY: Record<ConnectionFailureReason, string> = {
  [ConnectionFailureReason.AccessDenied]: 'Your access was removed.',
  [ConnectionFailureReason.ConnectionFailed]: 'The connection to the server failed.',
  [ConnectionFailureReason.SyncTimeout]: 'The server did not answer in time.',
  [ConnectionFailureReason.WorkerTransportFailed]: 'The editor lost its background link.',
  [ConnectionFailureReason.SessionEnded]: 'Your session ended. Sign in again.',
  [ConnectionFailureReason.HeavyRoomsFull]: HEAVY_ROOMS_FULL_SHORT_MESSAGE,
  [ConnectionFailureReason.Unknown]: 'The cause could not be identified.',
};

export function unsyncedDetailFor(failureReason: ConnectionFailureReason): string {
  if (failureReason === ConnectionFailureReason.SessionEnded) return UNSYNCED_LOST_ON_SIGN_IN_DETAIL;
  return UNSYNCED_LOST_ON_RELOAD_DETAIL;
}

export function actionLabelFor(failureReason: ConnectionFailureReason): string {
  if (failureReason === ConnectionFailureReason.SessionEnded) return SIGN_IN_LABEL;
  return RELOAD_LABEL;
}
