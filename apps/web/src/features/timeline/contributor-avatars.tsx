import { byVolumeDescending } from '@superdoc-collab/history/timeline';
import { ClientActor, type EventAuthor, type TimelineContributor } from '@superdoc-collab/types';
import { initialsOf } from '@/lib/initials';
import { AgentMark } from './agent-mark';
import { authorOf } from './author-of';

const MAX_AVATARS = 3;

export function AuthorAvatar({ name, actor }: { name: string; actor: ClientActor }) {
  return (
    <li title={name} className="relative flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
      {initialsOf(name)}
      {actor === ClientActor.Agent && (
        <span className="absolute -right-1 -bottom-1 rounded-full bg-primary p-0.5 text-primary-foreground">
          <AgentMark name={name} />
        </span>
      )}
    </li>
  );
}

export function ContributorAvatars({
  contributors,
  authors,
}: {
  contributors: TimelineContributor[];
  authors: Record<string, EventAuthor>;
}) {
  const ranked = [...contributors]
    .sort((left, right) => byVolumeDescending(left, right) || left.authorKey.localeCompare(right.authorKey))
    .slice(0, MAX_AVATARS);
  return (
    <ul className="flex items-center gap-1">
      {ranked.map((contributor) => {
        const author = authorOf({ authors, authorKey: contributor.authorKey });
        return <AuthorAvatar key={contributor.authorKey} name={author.name} actor={author.actor} />;
      })}
    </ul>
  );
}
