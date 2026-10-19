import { useEffect } from 'react';
import { useBlocker } from 'react-router';
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

const BLOCKED_STATE = 'blocked';

type ExitConfirmationDialogProps = { isUnsynced: boolean; onDownload: () => void };

export function ExitConfirmationDialog({ isUnsynced, onDownload }: ExitConfirmationDialogProps) {
  const blocker = useBlocker(isUnsynced);

  useEffect(() => {
    const shouldProceed = blocker.state === BLOCKED_STATE && !isUnsynced;
    if (shouldProceed) blocker.proceed();
  }, [blocker, isUnsynced]);

  if (blocker.state !== BLOCKED_STATE) return null;

  const { proceed, reset } = blocker;

  function handleOpenChange(isOpen: boolean): void {
    if (!isOpen) reset();
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
          <Button variant="destructive" onClick={proceed}>
            {LEAVE_LABEL}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
