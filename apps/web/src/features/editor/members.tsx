import type { DocumentMember } from '@superdoc-history/types';
import { initialsOf } from '@/lib/initials';
import { ONLINE_LABEL } from './editor-copy';

export function Members({ members }: { members: DocumentMember[]; currentUserId: string | null }) {
  return (
    <ul className="flex items-center gap-1">
      {members.map((member) => (
        <li
          key={member.user.id}
          title={member.user.name}
          className="relative flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium"
        >
          {initialsOf(member.user.name)}
          {member.online && (
            <span
              role="img"
              aria-label={ONLINE_LABEL}
              className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-primary"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
