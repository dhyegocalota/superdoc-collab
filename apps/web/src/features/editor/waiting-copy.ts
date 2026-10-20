export const PREPARING_DOCUMENT_MESSAGE = 'Preparing the document…';
export const TRY_AGAIN_LABEL = 'Try again';
export const PREPARATION_FAILED_MESSAGE = 'The document could not be prepared.';
export const PREPARATION_FAILED_HINT = 'The file may be damaged or not a valid .docx. Upload it again or try another file.';
export function deviceStoppedMessage(ownerName: string): string {
  return `The preparation on ${ownerName}'s device stopped.`;
}
export const DEVICE_STOPPED_HINT =
  'The browser preparing it was closed before it finished. Its owner can open the document again to start over.';
export const LOAD_RETRY_HINT = 'Check your connection and try again.';
export const DOCUMENT_READY_ANNOUNCEMENT = 'The document is ready.';
