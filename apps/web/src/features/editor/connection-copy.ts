import { ConnectionFailureReason } from '@superdoc-collab/types';

export const LOST_TITLE = 'You are offline.';
export const RECONNECTING_TITLE = 'Reconnecting…';
export const RECOVERED_TITLE = 'Back online';
export const FAILED_TITLE = 'Editing is paused: the connection failed.';
export const KEPT_AND_DATED_DETAIL = 'Your edits stay in this browser and are dated when they sync.';
export const UNSYNCED_LOST_ON_RELOAD_DETAIL = 'Unsynced edits are lost on reload. Download first to keep them.';
export const RELOAD_LABEL = 'Reload';
export const RELOADING_LABEL = 'Reloading…';

export const FAILURE_REASON_COPY: Record<ConnectionFailureReason, string> = {
  [ConnectionFailureReason.AccessDenied]: 'Your access was removed.',
  [ConnectionFailureReason.ConnectionFailed]: 'The connection to the server failed.',
  [ConnectionFailureReason.SyncTimeout]: 'The server did not answer in time.',
  [ConnectionFailureReason.WorkerTransportFailed]: 'The editor lost its background link.',
  [ConnectionFailureReason.Unknown]: 'The cause could not be identified.',
};
