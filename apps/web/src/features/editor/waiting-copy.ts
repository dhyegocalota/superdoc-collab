import { DOCUMENT_READY_GIVE_UP_MS, MINUTE_MS } from '@superdoc-collab/types';

export const PREPARING_DOCUMENT_MESSAGE = 'Preparing the document…';
export const NOT_READY_PAUSED_HEADING = 'The document is not ready yet';
export const NOT_READY_PAUSED_MESSAGE = `We stopped checking after ${DOCUMENT_READY_GIVE_UP_MS / MINUTE_MS} minutes. No editor has opened it once.`;
export const KEEP_WAITING_LABEL = 'Keep waiting';
export const TRY_AGAIN_LABEL = 'Try again';
export const LOAD_RETRY_HINT = 'Check your connection and try again.';
export const DOCUMENT_READY_ANNOUNCEMENT = 'The document is ready.';
