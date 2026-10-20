import type { SuperDoc } from 'superdoc';
import type { TimeTravel } from '@/features/timeline/use-time-travel';
import { TickingOpenProgressPanel, type OpenProgressViewAt } from '@/features/open-progress/ticking-open-progress-panel';
import type { EditorLoadProgress } from '@/features/open-progress/open-progress-view';
import { EDITOR_OPEN_STAGES } from '@/features/open-progress/open-stage';
import { VersionFrame } from '@/features/versions/version-frame';
import { cn } from '@/lib/utils';
import { LeaveOpeningButton } from './leave-opening-button';
import { HIDDEN_LOADING_OVERLAY_CLASS, SuperDocEditor } from './superdoc-editor';
import type { TransportReport } from './use-connection-state';
import type { EditorSetup } from './use-editor-setup';

export const DIMMED_EDITOR_AREA_CLASS = 'opacity-60';

type EditorSurfaceProps = {
  documentId: string;
  title: string;
  openProgress: OpenProgressViewAt | null;
  openStartedAt: number;
  editorSetup: EditorSetup | null;
  editorGeneration: number;
  isToolbarReady: boolean;
  toolbarContainer: HTMLElement | null;
  isInert: boolean;
  isDimmed: boolean;
  timeTravel: TimeTravel;
  onSuperdocChange: (superdoc: SuperDoc | null) => void;
  onContainerChange: (container: HTMLElement | null) => void;
  onTransportReport: (report: TransportReport) => void;
  onEditorUpdate: () => void;
  onDocumentEdit: () => void;
  onLoadProgress: (progress: EditorLoadProgress) => void;
};

export function EditorSurface({
  documentId,
  title,
  openProgress,
  openStartedAt,
  editorSetup,
  editorGeneration,
  isToolbarReady,
  toolbarContainer,
  isInert,
  isDimmed,
  timeTravel,
  onSuperdocChange,
  onContainerChange,
  onTransportReport,
  onEditorUpdate,
  onDocumentEdit,
  onLoadProgress,
}: EditorSurfaceProps) {
  return (
    <div
      data-testid="editor-surface"
      className={cn(
        'relative flex min-h-0 min-w-0 flex-1',
        isDimmed && DIMMED_EDITOR_AREA_CLASS,
        openProgress && HIDDEN_LOADING_OVERLAY_CLASS,
      )}
    >
      {editorSetup && isToolbarReady && (
        <SuperDocEditor
          key={editorGeneration}
          onSuperdocChange={onSuperdocChange}
          onContainerChange={onContainerChange}
          toolbarContainer={toolbarContainer}
          documentId={documentId}
          roomMode={editorSetup.roomMode}
          role={editorSetup.role}
          user={editorSetup.user}
          colorSlot={editorSetup.colorSlot}
          file={editorSetup.file}
          isInert={isInert}
          onTransportReport={onTransportReport}
          onEditorUpdate={onEditorUpdate}
          onDocumentEdit={onDocumentEdit}
          onLoadProgress={onLoadProgress}
        />
      )}
      {openProgress && (
        <TickingOpenProgressPanel
          title={title}
          stages={EDITOR_OPEN_STAGES}
          startedAt={openStartedAt}
          viewAt={openProgress}
          action={<LeaveOpeningButton />}
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
