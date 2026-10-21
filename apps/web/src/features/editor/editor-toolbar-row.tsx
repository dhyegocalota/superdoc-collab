import { DocumentRole } from '@superdoc-collab/types';
import { SummarizeEditsButton } from '@/features/timeline/summarize-edits-button';
import { ThemeButton } from './theme-button';

type EditorToolbarRowProps = {
  role: DocumentRole;
  containerRef: (element: HTMLDivElement | null) => void;
  isToolbarInert: boolean;
  isRowInert: boolean;
  isRunning: boolean;
  onSummarize: () => void;
};

export function EditorToolbarRow({ role, containerRef, isToolbarInert, isRowInert, isRunning, onSummarize }: EditorToolbarRowProps) {
  if (role === DocumentRole.Reader) return null;

  return (
    <div data-testid="editor-toolbar-row" inert={isRowInert} className="flex h-10 items-center overflow-x-clip border-b bg-background">
      <div ref={containerRef} data-testid="toolbar-container" inert={isToolbarInert} className="min-w-0 flex-1 overflow-x-clip" />
      <div className="flex shrink-0 items-center gap-1 px-2">
        <ThemeButton />
        <SummarizeEditsButton isRunning={isRunning} onSummarize={onSummarize} />
      </div>
    </div>
  );
}
