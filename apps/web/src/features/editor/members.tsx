import type { DocumentMember } from '@superdoc-collab/types';
import type { SuperDoc } from 'superdoc';
import { initialsOf } from '@/lib/initials';
import { memberLabel } from './editor-copy';

export function Members({
  members,
  currentUserId,
}: {
  members: DocumentMember[];
  currentUserId: string | null;
  superdoc?: SuperDoc | null;
  isPastVersion?: boolean;
}) {
  return (
    <ul className="flex items-center gap-1">
      {members.map((member) => {
        const isOnline = member.online || member.user.id === currentUserId;
        return (
          <li
            key={member.user.id}
            title={member.user.name}
            className="relative flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium"
          >
            <span aria-hidden>{initialsOf(member.user.name)}</span>
            <span className="sr-only">{memberLabel({ name: member.user.name, isOnline })}</span>
            {isOnline && (
              <span aria-hidden className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-online" />
            )}
          </li>
        );
      })}
    </ul>
  );
}
