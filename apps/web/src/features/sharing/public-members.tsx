import { MEMBERS_REFRESH_MS } from '@superdoc-collab/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { UserAvatar, UserAvatarSize } from '@/components/user-avatar';
import { memberLabel, onlineMembersLabel } from '@/features/editor/editor-copy';
import { pollWhileAvailable } from '@/lib/api';
import { fetchPublicMembers, publicMembersQueryKey } from './public-api';
import { ViewerPresence } from './viewer-avatar';

export function PublicMembers({ documentId }: { documentId: string }) {
  const { data } = useQuery({
    queryKey: publicMembersQueryKey(documentId),
    queryFn: () => fetchPublicMembers(documentId),
    placeholderData: keepPreviousData,
    refetchInterval: pollWhileAvailable(MEMBERS_REFRESH_MS),
    retry: false,
  });
  if (!data) return null;
  return (
    <div role="group" aria-label={onlineMembersLabel(data.members.length + data.visitors.length)} className="flex items-center gap-1">
      {data.members.map((member) => (
        <span key={`${member.name}-${member.colorSlot}`} role="img" aria-label={memberLabel(member.name)}>
          <UserAvatar name={member.name} colorSlot={member.colorSlot} size={UserAvatarSize.Large} isAgent={false} isOnline />
        </span>
      ))}
      {data.visitors.map((visitor) => (
        <ViewerPresence key={visitor.id} viewer={visitor} />
      ))}
    </div>
  );
}
