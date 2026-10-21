import type { PublicViewer } from '@superdoc-collab/types';
import { memberLabel } from '@/features/editor/editor-copy';
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

export function ViewerPresence({ viewer }: { viewer: PublicViewer }) {
  return (
    <span role="img" aria-label={memberLabel(viewer.name)}>
      <ViewerAvatar viewer={viewer} isOnline />
    </span>
  );
}
