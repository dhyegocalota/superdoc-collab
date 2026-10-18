import { byVolumeDescending } from '@superdoc-collab/history/timeline';
import { ClientActor, type EventAuthor, type TimelineContributor } from '@superdoc-collab/types';
import { UserAvatar, UserAvatarSize } from '@/components/user-avatar';
import { authorOf } from './author-of';
import { importedAuthorLabel } from './timeline-copy';
import { useAuthorColorSlots } from './use-author-color-slots';

const MAX_AVATARS = 3;

function titleOf({ id, name }: { id: string | null; name: string }): string {
  if (id === null) return importedAuthorLabel(name);
  return name;
}

export function AuthorAvatar({ author }: { author: Pick<EventAuthor, 'id' | 'name' | 'actor'> }) {
  const colorSlotOf = useAuthorColorSlots();
  const name = author.name.trim();
  return (
    <li title={titleOf({ id: author.id, name })}>
      <UserAvatar
        name={name}
        colorSlot={colorSlotOf(author)}
        size={UserAvatarSize.Small}
        isAgent={author.actor === ClientActor.Agent}
        isOnline={false}
      />
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
      {ranked.map((contributor) => (
        <AuthorAvatar key={contributor.authorKey} author={authorOf({ authors, authorKey: contributor.authorKey })} />
      ))}
    </ul>
  );
}
