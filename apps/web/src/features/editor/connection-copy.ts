import { ConnectionFailureReason } from '@superdoc-collab/types';

export const LOST_TITLE = 'You are offline.';
export const RECONNECTING_TITLE = 'Reconnecting…';
export const RECOVERED_TITLE = 'Back online';
export const FAILED_TITLE = 'Editing is paused because the connection failed.';
export const KEPT_AND_DATED_DETAIL = 'Your edits stay in this browser and are dated when they sync.';
export const UNSYNCED_LOST_ON_RELOAD_DETAIL =
  'Edits that have not synced are lost when you reload. Download the document first to keep them.';
export const RELOAD_LABEL = 'Reload';

export const FAILURE_REASON_COPY: Record<ConnectionFailureReason, string> = {
  [ConnectionFailureReason.AccessDenied]: 'Your session ended or your access to this document was removed.',
  [ConnectionFailureReason.ConnectionFailed]: 'The connection to the server could not be kept.',
  [ConnectionFailureReason.SyncTimeout]: 'The server did not answer in time.',
  [ConnectionFailureReason.WorkerTransportFailed]: 'The editor lost its background connection.',
  [ConnectionFailureReason.Unknown]: 'The connection stopped for a reason that could not be identified.',
};
