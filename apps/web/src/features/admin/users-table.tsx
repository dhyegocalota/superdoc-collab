import { UserRole, type AdminUser } from '@superdoc-collab/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatTimestamp } from '@/lib/format-date-time';
import { useTimeZone } from '@/lib/use-time-zone';
import { ADMIN_USERS_QUERY_KEY, setUserRole } from './admin-api';
import {
  ACTION_FAILED_MESSAGE,
  MAKE_ADMIN_LABEL,
  MAKE_USER_LABEL,
  USER_ROLE_LABELS,
  USERS_COLUMN_LABELS,
  USERS_TABLE_LABEL,
} from './admin-copy';

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
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{USER_ROLE_LABELS[user.role]}</TableCell>
              <TableCell>{formatTimestamp({ time: user.createdAt, timeZone })}</TableCell>
              <TableCell>{user.id !== signedInUserId && <RoleToggle user={user} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
