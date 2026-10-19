import { UserRole, type AdminUser } from '@superdoc-collab/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatTimestamp } from '@/lib/format-date-time';
import { useTimeZone } from '@/lib/use-time-zone';
import { ADMIN_USERS_QUERY_KEY, createPasswordReset, setUserRole } from './admin-api';
import {
  ACTION_FAILED_MESSAGE,
  ARCHIVED_CHIP_LABEL,
  MAKE_ADMIN_LABEL,
  MAKE_USER_LABEL,
  PASSWORD_RESET_COPIED_TOAST,
  PASSWORD_RESET_CREATED_DESCRIPTION,
  PASSWORD_RESET_CREATED_TITLE,
  RESET_PASSWORD_LABEL,
  USER_ROLE_LABELS,
  USERS_COLUMN_LABELS,
  USERS_TABLE_LABEL,
} from './admin-copy';
import { LinkCreatedDialog } from './link-created-dialog';
import { ArchiveButton, ImpersonateButton, RestoreButton } from './user-access-buttons';

const ROLE_TOGGLES: Record<UserRole, { label: string; nextRole: UserRole }> = {
  [UserRole.Admin]: { label: MAKE_USER_LABEL, nextRole: UserRole.User },
  [UserRole.User]: { label: MAKE_ADMIN_LABEL, nextRole: UserRole.Admin },
};

function RoleToggle({ user }: { user: AdminUser }) {
  const queryClient = useQueryClient();
  const { label, nextRole } = ROLE_TOGGLES[user.role];
  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => setUserRole({ id: user.id, role: nextRole }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY }),
  });

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => mutate()}>
        {label}
      </Button>
      {isError && <ErrorMessage>{ACTION_FAILED_MESSAGE}</ErrorMessage>}
    </div>
  );
}

function PasswordResetButton({ user }: { user: AdminUser }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { mutate, reset, data, isPending, isError } = useMutation({ mutationFn: () => createPasswordReset(user.id) });

  return (
    <div className="flex items-center gap-2">
      <Button ref={buttonRef} variant="outline" size="sm" disabled={isPending} onClick={() => mutate()}>
        {RESET_PASSWORD_LABEL}
      </Button>
      {isError && <ErrorMessage>{ACTION_FAILED_MESSAGE}</ErrorMessage>}
      {data && (
        <LinkCreatedDialog
          url={data.url}
          title={PASSWORD_RESET_CREATED_TITLE}
          description={PASSWORD_RESET_CREATED_DESCRIPTION}
          copiedToast={PASSWORD_RESET_COPIED_TOAST}
          onClose={reset}
          returnFocusRef={buttonRef}
        />
      )}
    </div>
  );
}

export function UsersTable({ users, signedInUserId }: { users: AdminUser[]; signedInUserId: string }) {
  const { timeZone } = useTimeZone();
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table aria-label={USERS_TABLE_LABEL}>
        <TableHeader>
          <TableRow>
            {USERS_COLUMN_LABELS.map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isOtherUser = user.id !== signedInUserId;
            const canArchive = isOtherUser && !user.isArchived;
            const canImpersonate = canArchive && user.role !== UserRole.Admin;
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {user.name}
                    {user.isArchived && <Badge variant="secondary">{ARCHIVED_CHIP_LABEL}</Badge>}
                  </div>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{USER_ROLE_LABELS[user.role]}</TableCell>
                <TableCell>{formatTimestamp({ time: user.createdAt, timeZone })}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {isOtherUser && <RoleToggle user={user} />}
                    <PasswordResetButton user={user} />
                    {canArchive && <ArchiveButton user={user} />}
                    {user.isArchived && <RestoreButton user={user} />}
                    {canImpersonate && <ImpersonateButton user={user} />}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
