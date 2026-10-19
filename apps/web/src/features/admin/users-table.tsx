import type { AdminUser } from '@superdoc-collab/types';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatTimestamp } from '@/lib/format-date-time';
import { useTimeZone } from '@/lib/use-time-zone';
import { ARCHIVED_CHIP_LABEL, USER_ROLE_LABELS, USERS_ACTIONS_COLUMN_LABEL, USERS_COLUMN_LABELS, USERS_TABLE_LABEL } from './admin-copy';
import { UserActionsMenu } from './user-actions-menu';

const ACTIONS_LABEL_CLASS_NAME = 'sr-only sm:not-sr-only';
const ROW_TINT_CLASS_NAME = 'bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]';
const ACTIONS_COLUMN_CLASS_NAME = `sticky right-0 bg-background shadow-[inset_1px_0_0_var(--border)] [tr:hover>&]:${ROW_TINT_CLASS_NAME} [tr:has([aria-expanded=true])>&]:${ROW_TINT_CLASS_NAME}`;

export function UsersTable({ users, signedInUserId }: { users: AdminUser[]; signedInUserId: string }) {
  const { timeZone } = useTimeZone();
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table aria-label={USERS_TABLE_LABEL}>
        <TableHeader>
          <TableRow>
            {USERS_COLUMN_LABELS.map((label) => (
              <TableHead key={label} className={label === USERS_ACTIONS_COLUMN_LABEL ? ACTIONS_COLUMN_CLASS_NAME : undefined}>
                {label === USERS_ACTIONS_COLUMN_LABEL ? <span className={ACTIONS_LABEL_CLASS_NAME}>{label}</span> : label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
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
              <TableCell className={ACTIONS_COLUMN_CLASS_NAME}>
                <UserActionsMenu user={user} signedInUserId={signedInUserId} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
