import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DROP_OVERLAY_LABEL } from './documents-copy';

const FILES_DRAG_TYPE = 'Files';
const ESCAPE_KEY = 'Escape';
const NO_BUTTONS_PRESSED = 0;

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(FILES_DRAG_TYPE) === true;
}

function droppedFiles(event: DragEvent): File[] {
  const files = event.dataTransfer?.files;
  if (!files) return [];
  return Array.from(files);
}

export function UploadDropOverlay({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const enteredCount = useRef(0);

  useEffect(() => {
    function reset(): void {
      enteredCount.current = 0;
      setIsDragging(false);
    }

    function onDragEnter(event: DragEvent): void {
      if (!carriesFiles(event)) return;
      enteredCount.current += 1;
      setIsDragging(true);
    }

    function onDragLeave(event: DragEvent): void {
      if (!carriesFiles(event)) return;
      enteredCount.current -= 1;
      const hasLeftWindow = event.relatedTarget === null;
      if (enteredCount.current > 0 && !hasLeftWindow) return;
      reset();
    }

    function onDragOver(event: DragEvent): void {
      if (!carriesFiles(event)) return;
      event.preventDefault();
    }

    function onDrop(event: DragEvent): void {
      reset();
      if (!carriesFiles(event)) return;
      event.preventDefault();
      onFiles(droppedFiles(event));
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== ESCAPE_KEY) return;
      reset();
    }

    function onPointerMove(event: PointerEvent): void {
      if (event.buttons !== NO_BUTTONS_PRESSED) return;
      reset();
    }

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', reset);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointermove', onPointerMove);
    document.documentElement.addEventListener('mouseleave', reset);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', reset);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('mouseleave', reset);
    };
  }, [onFiles]);

  if (!isDragging) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
      <div className="flex w-full max-w-xl flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary bg-card p-12 text-center shadow-lg">
        <Upload aria-hidden className="size-8 text-primary" />
        <p className="text-lg font-semibold">{DROP_OVERLAY_LABEL}</p>
      </div>
    </div>
  );
}
