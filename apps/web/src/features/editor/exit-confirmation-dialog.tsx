import { useEffect } from 'react';
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
import { allowLeave, cancelLeave, disallowLeave, getUnsyncedEditsSnapshot, useUnsyncedEditsSnapshot } from './unsynced-edits-store';

const BLOCKED_STATE = 'blocked';

function exitChoicesOf({
  blocker,
  pendingLeave,
}: {
  blocker: Blocker;
  pendingLeave: (() => void | Promise<void>) | null;
}): ExitChoices | null {
  if (blocker.state === BLOCKED_STATE) return { leave: blocker.proceed, stay: blocker.reset };
  if (!pendingLeave) return null;
  function leave(): void {
    allowLeave();
    cancelLeave();
    Promise.resolve(pendingLeave?.()).catch(disallowLeave);
  }
  return { leave, stay: cancelLeave };
}

type ExitConfirmationDialogProps = { isUnsynced: boolean; onDownload: () => void };

type ExitChoices = { leave: () => void; stay: () => void };

export function ExitConfirmationDialog({ isUnsynced, onDownload }: ExitConfirmationDialogProps) {
  const blocker = useBlocker(() => isUnsynced && !getUnsyncedEditsSnapshot().isLeaveAllowed);
  const { pendingLeave } = useUnsyncedEditsSnapshot();
  const choices = exitChoicesOf({ blocker, pendingLeave });

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
