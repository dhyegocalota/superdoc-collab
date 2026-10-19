import type { SuperDoc } from 'superdoc';
import type { TimeTravel } from '@/features/timeline/use-time-travel';
import { VersionFrame } from '@/features/versions/version-frame';
import { cn } from '@/lib/utils';
import { SuperDocEditor } from './superdoc-editor';
import type { TransportReport } from './use-connection-state';
import type { EditorSetup } from './use-editor-setup';

export const DIMMED_EDITOR_AREA_CLASS = 'opacity-60';

type EditorSurfaceProps = {
  documentId: string;
  editorSetup: EditorSetup | null;
  editorGeneration: number;
  isToolbarReady: boolean;
  toolbarContainer: HTMLElement | null;
  isInert: boolean;
  isSuperseded: boolean;
  isDimmed: boolean;
  timeTravel: TimeTravel;
  onSuperdocChange: (superdoc: SuperDoc | null) => void;
  onContainerChange: (container: HTMLElement | null) => void;
  onTransportReport: (report: TransportReport) => void;
  onEditorUpdate: () => void;
  onDocumentEdit: () => void;
};

export function EditorSurface({
  documentId,
  editorSetup,
  editorGeneration,
  isToolbarReady,
  toolbarContainer,
  isInert,
  isSuperseded,
  isDimmed,
  timeTravel,
  onSuperdocChange,
  onContainerChange,
  onTransportReport,
  onEditorUpdate,
  onDocumentEdit,
}: EditorSurfaceProps) {
  return (
    <div data-testid="editor-surface" className={cn('relative flex min-h-0 min-w-0 flex-1', isDimmed && DIMMED_EDITOR_AREA_CLASS)}>
      {editorSetup && isToolbarReady && (
        <SuperDocEditor
          key={editorGeneration}
          onSuperdocChange={onSuperdocChange}
          onContainerChange={onContainerChange}
          toolbarContainer={toolbarContainer}
          documentId={documentId}
          roomMode={editorSetup.roomMode}
          creatorTicket={editorSetup.creatorTicket}
          role={editorSetup.role}
          user={editorSetup.user}
          colorSlot={editorSetup.colorSlot}
          file={editorSetup.file}
          isInert={isInert}
          isSuperseded={isSuperseded}
          onTransportReport={onTransportReport}
          onEditorUpdate={onEditorUpdate}
          onDocumentEdit={onDocumentEdit}
          onLoadProgress={() => undefined}
        />
      )}
      <VersionFrame
        documentId={documentId}
        version={timeTravel.shownVersion}
        requestedSequence={timeTravel.requestedSequence}
        runs={timeTravel.runs}
        onReady={timeTravel.reportReady}
        onFailed={timeTravel.reportFailure}
        onExit={timeTravel.backToLive}
      />
    </div>
  );
}
