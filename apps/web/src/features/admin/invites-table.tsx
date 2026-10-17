import { InviteState, type CreatedInvite, type InviteSummary } from '@superdoc-history/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatTimestamp } from '@/lib/format-date-time';
import { createInvite, INVITES_QUERY_KEY, revokeInvite } from './admin-api';
import {
  ACTION_FAILED_MESSAGE,
  GENERATE_INVITE_LABEL,
  INVITE_STATE_LABELS,
  INVITES_COLUMN_LABELS,
  INVITES_TABLE_LABEL,
  NO_INVITES_MESSAGE,
  NOT_ACCEPTED_LABEL,
  REVOKE_LABEL,
} from './admin-copy';
import { InviteCreatedDialog } from './invite-created-dialog';

function RevokeButton({ invite }: { invite: InviteSummary }) {
  const queryClient = useQueryClient();
  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => revokeInvite(invite.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY }),
  });

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => mutate()}>
        {REVOKE_LABEL}
      </Button>
      {isError && <ErrorMessage>{ACTION_FAILED_MESSAGE}</ErrorMessage>}
    </div>
  );
}

function InvitesList({ invites }: { invites: InviteSummary[] }) {
  if (invites.length === 0) return <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">{NO_INVITES_MESSAGE}</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table aria-label={INVITES_TABLE_LABEL}>
        <TableHeader>
          <TableRow>
            {INVITES_COLUMN_LABELS.map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((invite) => (
            <TableRow key={invite.id}>
              <TableCell>{INVITE_STATE_LABELS[invite.state]}</TableCell>
              <TableCell>{formatTimestamp(invite.createdAt)}</TableCell>
              <TableCell>{formatTimestamp(invite.expiresAt)}</TableCell>
              <TableCell>{invite.createdBy.name}</TableCell>
              <TableCell>{invite.acceptedBy ? invite.acceptedBy.name : NOT_ACCEPTED_LABEL}</TableCell>
              <TableCell>{invite.state === InviteState.Pending && <RevokeButton invite={invite} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function InvitesTable({ invites }: { invites: InviteSummary[] }) {
  const queryClient = useQueryClient();
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const { mutate, isPending, isError } = useMutation({
    mutationFn: createInvite,
    onSuccess: async (invite) => {
      setCreated(invite);
      await queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button ref={generateButtonRef} disabled={isPending} onClick={() => mutate()}>
          {GENERATE_INVITE_LABEL}
        </Button>
        {isError && <ErrorMessage>{ACTION_FAILED_MESSAGE}</ErrorMessage>}
      </div>
      <InvitesList invites={invites} />
      {created && <InviteCreatedDialog invite={created} onClose={() => setCreated(null)} returnFocusRef={generateButtonRef} />}
    </div>
  );
}
