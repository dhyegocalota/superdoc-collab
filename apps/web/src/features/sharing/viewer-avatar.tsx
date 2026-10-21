import type { PublicViewer } from '@superdoc-collab/types';
import { UserAvatar, UserAvatarSize } from '@/components/user-avatar';
import { AnimalAvatar, AnimalAvatarSize } from './animal-avatar';

export function ViewerAvatar({ viewer }: { viewer: PublicViewer }) {
  if (viewer.animal === null)
    return <UserAvatar name={viewer.name} colorSlot={viewer.colorSlot} size={UserAvatarSize.Large} isAgent={false} isOnline={false} />;
  return <AnimalAvatar animal={viewer.animal} colorSlot={viewer.colorSlot} size={AnimalAvatarSize.Large} />;
}
