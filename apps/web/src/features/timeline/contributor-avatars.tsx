import type { EventAuthor, TimelineContributor } from '@superdoc-history/types';
import { initialsOf } from '@/lib/initials';
import { authorOf } from './author-of';

const MAX_AVATARS = 3;

export function ContributorAvatars({ contributors, authors }: { contributors: TimelineContributor[]; authors: Record<string, EventAuthor> }) {
  const ranked = [...contributors].sort((left, right) => right.inserted + right.deleted - (left.inserted + left.deleted) || left.authorKey.localeCompare(right.authorKey)).slice(0, MAX_AVATARS);
  return (
    <ul className="flex items-center gap-1">
      {ranked.map((contributor) => {
        const author = authorOf({ authors, authorKey: contributor.authorKey });
        return (
          <li key={contributor.authorKey} title={author.name} className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
            {initialsOf(author.name)}
          </li>
        );
      })}
    </ul>
  );
}
