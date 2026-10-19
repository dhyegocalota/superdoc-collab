import type { ConnectionFailureReason, ConnectionState } from '@superdoc-collab/types';
import { ErrorMessage } from '@/components/error-message';
import { ConnectionBanner } from './connection-banner';
import { RELOAD_FAILED_MESSAGE } from './connection-copy';
import { LOADING_DOCUMENT_REASON_ID } from './download-menu';
import { DOCUMENT_LOAD_ERROR_MESSAGE, EXPORT_FAILED_MESSAGE, LOADING_DOCUMENT_MESSAGE } from './editor-copy';

type EditorStatusProps = {
  isDocumentLoading: boolean;
  hasFileError: boolean;
  hasExportFailed: boolean;
  hasReloadFailed: boolean;
  isReloading: boolean;
  connectionState: ConnectionState;
  failureReason: ConnectionFailureReason | null;
  onConnectionAction: () => void;
};

export function EditorStatus({
  isDocumentLoading,
  hasFileError,
  hasExportFailed,
  hasReloadFailed,
  isReloading,
  connectionState,
  failureReason,
  onConnectionAction,
}: EditorStatusProps) {
  const isLoadingLineShown = !hasFileError;
  return (
    <>
      {isDocumentLoading && (
        <div id={LOADING_DOCUMENT_REASON_ID}>
          {hasFileError && <ErrorMessage className="px-4 py-1">{DOCUMENT_LOAD_ERROR_MESSAGE}</ErrorMessage>}
          {isLoadingLineShown && (
            <p role="status" className="sr-only">
              {LOADING_DOCUMENT_MESSAGE}
            </p>
          )}
        </div>
      )}
      {hasExportFailed && <ErrorMessage className="px-4 py-2">{EXPORT_FAILED_MESSAGE}</ErrorMessage>}
      <ConnectionBanner state={connectionState} failureReason={failureReason} isReloading={isReloading} onAction={onConnectionAction} />
      {hasReloadFailed && <ErrorMessage className="px-4 py-2">{RELOAD_FAILED_MESSAGE}</ErrorMessage>}
    </>
  );
}
