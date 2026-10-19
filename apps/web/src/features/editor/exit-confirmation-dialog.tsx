import { useEffect, useRef, type RefObject } from 'react';
import { useBlocker, type Blocker } from 'react-router';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DOWNLOAD_BUTTON_LABEL, EXIT_CONFIRMATION_DESCRIPTION, EXIT_CONFIRMATION_TITLE, LEAVE_LABEL, STAY_LABEL } from './editor-copy';
import { cancelLeave, useUnsyncedEditsSnapshot } from './unsynced-edits-store';

const BLOCKED_STATE = 'blocked';

function exitChoicesOf({
  blocker,
  pendingLeave,
  isLeavingRef,
}: {
  blocker: Blocker;
  pendingLeave: (() => void) | null;
  isLeavingRef: RefObject<boolean>;
}): ExitChoices | null {
  if (blocker.state === BLOCKED_STATE) return { leave: blocker.proceed, stay: blocker.reset };
  if (!pendingLeave) return null;
  function leave(): void {
    isLeavingRef.current = true;
    cancelLeave();
    pendingLeave?.();
  }
  return { leave, stay: cancelLeave };
}

type ExitConfirmationDialogProps = { isUnsynced: boolean; onDownload: () => void };

type ExitChoices = { leave: () => void; stay: () => void };

export function ExitConfirmationDialog({ isUnsynced, onDownload }: ExitConfirmationDialogProps) {
  const isLeavingRef = useRef(false);
  const blocker = useBlocker(() => isUnsynced && !isLeavingRef.current);
  const { pendingLeave } = useUnsyncedEditsSnapshot();
  const choices = exitChoicesOf({ blocker, pendingLeave, isLeavingRef });

  useEffect(() => {
    if (choices && !isUnsynced) choices.leave();
  }, [choices, isUnsynced]);

  if (!choices) return null;

  const { leave, stay } = choices;

  function handleOpenChange(isOpen: boolean): void {
    if (!isOpen) stay();
  }

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{EXIT_CONFIRMATION_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{EXIT_CONFIRMATION_DESCRIPTION}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{STAY_LABEL}</AlertDialogCancel>
          <Button variant="outline" onClick={onDownload}>
            {DOWNLOAD_BUTTON_LABEL}
          </Button>
          <Button variant="destructive" onClick={leave}>
            {LEAVE_LABEL}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
