import type { AuthorColorSlot } from '@superdoc-collab/types';
import { AgentMark } from '@/features/timeline/agent-mark';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';

export enum UserAvatarSize {
  Small = 24,
  Large = 32,
}

const SIZE_CLASSES: Record<UserAvatarSize, string> = {
  [UserAvatarSize.Small]: 'size-6 text-[10px]',
  [UserAvatarSize.Large]: 'size-8 text-xs',
};

const COLOR_CLASSES: Record<AuthorColorSlot, string> = {
  1: 'bg-author-1',
  2: 'bg-author-2',
  3: 'bg-author-3',
  4: 'bg-author-4',
  5: 'bg-author-5',
  6: 'bg-author-6',
};

type UserAvatarProps = { name: string; colorSlot: AuthorColorSlot; size: UserAvatarSize; isAgent: boolean; isOnline: boolean };

export function UserAvatar({ name, colorSlot, size, isAgent, isOnline }: UserAvatarProps) {
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full font-medium text-primary-foreground',
        SIZE_CLASSES[size],
        COLOR_CLASSES[colorSlot],
      )}
    >
      {initialsOf(name)}
      {isAgent && (
        <span className="absolute -right-1 -bottom-1 rounded-full bg-primary p-0.5 text-primary-foreground">
          <AgentMark name={name} />
        </span>
      )}
      {isOnline && <span aria-hidden className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-online" />}
    </span>
  );
}
