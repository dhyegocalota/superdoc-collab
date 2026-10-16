import type { DocumentMember } from '@superdoc-history/types';
import { ONLINE_LABEL } from './editor-copy';

const INITIALS_LIMIT = 2;

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, INITIALS_LIMIT)
    .join('')
    .toUpperCase();
}

export function Members({ members }: { members: DocumentMember[] }) {
  return (
    <ul className="flex items-center gap-1">
      {members.map((member) => (
        <li key={member.user.id} title={member.user.name} className="relative flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {initialsOf(member.user.name)}
          {member.online && <span role="img" aria-label={ONLINE_LABEL} className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-primary" />}
        </li>
      ))}
    </ul>
  );
}
