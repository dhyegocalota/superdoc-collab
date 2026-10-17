import { DocumentRole } from '@superdoc-collab/types';
import { SummarizeEditsButton } from '@/features/timeline/summarize-edits-button';

type EditorToolbarRowProps = {
  role: DocumentRole;
  containerRef: (element: HTMLDivElement | null) => void;
  isToolbarInert: boolean;
  isRunning: boolean;
  onSummarize: () => void;
};

export function EditorToolbarRow({ role, containerRef, isToolbarInert, isRunning, onSummarize }: EditorToolbarRowProps) {
  if (role === DocumentRole.Reader) return null;

  return (
    <div data-testid="editor-toolbar-row" className="flex h-10 items-center border-b bg-background">
      <div ref={containerRef} data-testid="toolbar-container" inert={isToolbarInert} className="min-w-0 flex-1" />
      <div className="shrink-0 px-2">
        <SummarizeEditsButton isRunning={isRunning} onSummarize={onSummarize} />
      </div>
    </div>
  );
}
