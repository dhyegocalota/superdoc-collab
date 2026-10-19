import { UserRole, type AdminUser } from '@superdoc-collab/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ellipsis } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useImpersonate } from '@/features/impersonation/use-impersonation';
import { ADMIN_USERS_QUERY_KEY, archiveUser, createPasswordReset, restoreUser, setUserRole } from './admin-api';
import {
  actionFailedMessage,
  actionsMenuLabel,
  ARCHIVE_DIALOG_DESCRIPTION,
  ARCHIVE_LABEL,
  archiveDialogTitle,
  CANCEL_LABEL,
  IMPERSONATE_LABEL,
  MAKE_ADMIN_LABEL,
  MAKE_USER_LABEL,
  PASSWORD_RESET_COPIED_TOAST,
  PASSWORD_RESET_CREATED_DESCRIPTION,
  PASSWORD_RESET_CREATED_TITLE,
  RESET_PASSWORD_LABEL,
  RESTORE_LABEL,
} from './admin-copy';
import { LinkCreatedDialog } from './link-created-dialog';

const ROLE_TOGGLES: Record<UserRole, { label: string; nextRole: UserRole }> = {
  [UserRole.Admin]: { label: MAKE_USER_LABEL, nextRole: UserRole.User },
  [UserRole.User]: { label: MAKE_ADMIN_LABEL, nextRole: UserRole.Admin },
};

export function UserActionsMenu({ user, signedInUserId }: { user: AdminUser; signedInUserId: string }) {
  const queryClient = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [failedAction, setFailedAction] = useState<string | null>(null);
  function invalidateUsers(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
  }

  const roleToggle = ROLE_TOGGLES[user.role];
  const setRole = useMutation({ mutationFn: () => setUserRole({ id: user.id, role: roleToggle.nextRole }), onSuccess: invalidateUsers });
  const resetPassword = useMutation({ mutationFn: () => createPasswordReset(user.id) });
  const archive = useMutation({ mutationFn: () => archiveUser(user.id), onSuccess: invalidateUsers });
  const restore = useMutation({ mutationFn: () => restoreUser(user.id), onSuccess: invalidateUsers });
  const impersonate = useImpersonate(user.id);
  const isPending = [setRole, resetPassword, archive, restore, impersonate].some((mutation) => mutation.isPending);
  const isOtherUser = user.id !== signedInUserId;
  const canArchive = isOtherUser && !user.isArchived;
  const canImpersonate = canArchive && user.role !== UserRole.Admin;

  function perform({ label, start }: { label: string; start: (options: { onError: () => void }) => void }): void {
    setFailedAction(null);
    start({ onError: () => setFailedAction(label) });
  }

  function confirmArchive(): void {
    setIsConfirmingArchive(false);
    perform({ label: ARCHIVE_LABEL, start: (options) => archive.mutate(undefined, options) });
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} variant="ghost" size="icon" aria-label={actionsMenuLabel(user.name)}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isOtherUser && (
            <DropdownMenuItem
              disabled={isPending}
              onSelect={() => perform({ label: roleToggle.label, start: (options) => setRole.mutate(undefined, options) })}
            >
              {roleToggle.label}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={isPending}
            onSelect={() => perform({ label: RESET_PASSWORD_LABEL, start: (options) => resetPassword.mutate(undefined, options) })}
          >
            {RESET_PASSWORD_LABEL}
          </DropdownMenuItem>
          {user.isArchived && (
            <DropdownMenuItem
              disabled={isPending}
              onSelect={() => perform({ label: RESTORE_LABEL, start: (options) => restore.mutate(undefined, options) })}
            >
              {RESTORE_LABEL}
            </DropdownMenuItem>
          )}
          {canImpersonate && (
            <DropdownMenuItem
              disabled={isPending}
              onSelect={() => perform({ label: IMPERSONATE_LABEL, start: (options) => impersonate.mutate(undefined, options) })}
            >
              {IMPERSONATE_LABEL}
            </DropdownMenuItem>
          )}
          {canArchive && <DropdownMenuSeparator />}
          {canArchive && (
            <DropdownMenuItem variant="destructive" disabled={isPending} onSelect={() => setIsConfirmingArchive(true)}>
              {ARCHIVE_LABEL}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {failedAction !== null && <ErrorMessage>{actionFailedMessage(failedAction)}</ErrorMessage>}
      {resetPassword.data && (
        <LinkCreatedDialog
          url={resetPassword.data.url}
          title={PASSWORD_RESET_CREATED_TITLE}
          description={PASSWORD_RESET_CREATED_DESCRIPTION}
          copiedToast={PASSWORD_RESET_COPIED_TOAST}
          onClose={resetPassword.reset}
          returnFocusRef={triggerRef}
        />
      )}
      <AlertDialog open={isConfirmingArchive} onOpenChange={setIsConfirmingArchive}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{archiveDialogTitle(user.name)}</AlertDialogTitle>
            <AlertDialogDescription>{ARCHIVE_DIALOG_DESCRIPTION}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{CANCEL_LABEL}</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmArchive}>
              {ARCHIVE_LABEL}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
