import type { AdminUser } from '@superdoc-collab/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
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
import { useImpersonate } from '@/features/impersonation/use-impersonation';
import { ADMIN_USERS_QUERY_KEY, archiveUser, restoreUser } from './admin-api';
import {
  ACTION_FAILED_MESSAGE,
  ARCHIVE_DIALOG_DESCRIPTION,
  ARCHIVE_LABEL,
  archiveDialogTitle,
  CANCEL_LABEL,
  IMPERSONATE_LABEL,
  RESTORE_LABEL,
} from './admin-copy';

export function ArchiveButton({ user }: { user: AdminUser }) {
  const queryClient = useQueryClient();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => archiveUser(user.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY }),
  });

  function confirm(): void {
    setIsConfirming(false);
    mutate();
  }

  return (
    <div className="flex items-center gap-2">
      <Button ref={buttonRef} variant="outline" size="sm" disabled={isPending} onClick={() => setIsConfirming(true)}>
        {ARCHIVE_LABEL}
      </Button>
      {isError && <ErrorMessage>{ACTION_FAILED_MESSAGE}</ErrorMessage>}
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            buttonRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{archiveDialogTitle(user.name)}</AlertDialogTitle>
            <AlertDialogDescription>{ARCHIVE_DIALOG_DESCRIPTION}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{CANCEL_LABEL}</AlertDialogCancel>
            <Button variant="destructive" onClick={confirm}>
              {ARCHIVE_LABEL}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RestoreButton({ user }: { user: AdminUser }) {
  const queryClient = useQueryClient();
  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => restoreUser(user.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY }),
  });

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => mutate()}>
        {RESTORE_LABEL}
      </Button>
      {isError && <ErrorMessage>{ACTION_FAILED_MESSAGE}</ErrorMessage>}
    </div>
  );
}

export function ImpersonateButton({ user }: { user: AdminUser }) {
  const { mutate, isPending, isError } = useImpersonate(user.id);

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => mutate()}>
        {IMPERSONATE_LABEL}
      </Button>
      {isError && <ErrorMessage>{ACTION_FAILED_MESSAGE}</ErrorMessage>}
    </div>
  );
}
