import type { EventAuthor, TimelineContributor } from '@superdoc-history/types';
import { initialsOf } from '@/lib/initials';
import { authorOf } from './author-of';

const MAX_AVATARS = 3;

export function AuthorAvatar({ name }: { name: string }) {
  return (
    <li title={name} className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
      {initialsOf(name)}
    </li>
  );
}

export function ContributorAvatars({ contributors, authors }: { contributors: TimelineContributor[]; authors: Record<string, EventAuthor> }) {
  const ranked = [...contributors].sort((left, right) => right.inserted + right.deleted - (left.inserted + left.deleted) || left.authorKey.localeCompare(right.authorKey)).slice(0, MAX_AVATARS);
  return (
    <ul className="flex items-center gap-1">
      {ranked.map((contributor) => (
        <AuthorAvatar key={contributor.authorKey} name={authorOf({ authors, authorKey: contributor.authorKey }).name} />
      ))}
    </ul>
  );
}
