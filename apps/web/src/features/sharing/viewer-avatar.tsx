import type { PublicViewer } from '@superdoc-collab/types';
import { UserAvatar, UserAvatarSize } from '@/components/user-avatar';

export function ViewerAvatar({ viewer, isOnline = false }: { viewer: PublicViewer; isOnline?: boolean }) {
  return (
    <UserAvatar
      name={viewer.name}
      colorSlot={viewer.colorSlot}
      size={UserAvatarSize.Large}
      isAgent={false}
      isOnline={isOnline}
      animal={viewer.animal}
    />
  );
}
