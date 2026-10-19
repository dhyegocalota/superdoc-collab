import { JUMP_FAILED_NOTICE_MS, MEMBERS_PRESENCE_DEBOUNCE_MS, type DocumentMember } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import type { SuperDoc, SuperDocAwarenessUpdatePayload } from 'superdoc';
import { UserAvatar, UserAvatarSize } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MEDIUM_BREAKPOINT_PX } from '@/lib/breakpoints';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { useMinWidth } from '@/lib/use-min-width';
import {
  BACK_TO_LIVE_TO_JUMP_REASON,
  cursorNotFoundMessage,
  goToCursorLabel,
  memberLabel,
  moreMembersLabel,
  movedToCursorMessage,
  cursorOffScreenReason,
  onlineMembersLabel,
  SELF_MEMBER_REASON,
} from './editor-copy';
import { membersQueryKey } from './editor-api';
import { overflowCountLabel } from './members-copy';
import { JumpOutcome, useMemberCursors } from './use-member-cursors';

const MAX_MEMBERS_WITHOUT_MENU = 5;
const MEMBERS_BESIDE_MENU = 4;
const NARROW_MEMBERS_WITHOUT_MENU = 3;

const AWARENESS_UPDATE_EVENT = 'awareness-update';

type AwarenessChange = Pick<SuperDocAwarenessUpdatePayload, 'added' | 'removed'>;
type JumpState = { member: DocumentMember; reason: string | null };

function jumpReasonOf({
  member,
  currentUserId,
  isPastVersion,
  isInDocument,
}: {
  member: DocumentMember;
  currentUserId: string | null;
  isPastVersion: boolean;
  isInDocument: boolean;
}): string | null {
  const name = member.user.name;
  if (isPastVersion) return BACK_TO_LIVE_TO_JUMP_REASON;
  if (member.user.id === currentUserId) return SELF_MEMBER_REASON;
  if (!isInDocument) return cursorOffScreenReason(name);
  return null;
}

function MemberAvatar({ member }: { member: DocumentMember }) {
  return <UserAvatar name={member.user.name} colorSlot={member.colorSlot} size={UserAvatarSize.Large} isAgent={false} isOnline />;
}

function MemberButton({ state, onJump }: { state: JumpState; onJump: (member: DocumentMember) => JumpOutcome }) {
  const { member, reason } = state;
  const name = member.user.name;
  const [isOpen, setIsOpen] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const reasonId = useId();

  useEffect(() => {
    if (!isFailed) return;
    const timer = setTimeout(() => setIsFailed(false), JUMP_FAILED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [isFailed]);

  function jump(): void {
    if (reason !== null) return;
    setIsFailed(onJump(member) === JumpOutcome.NotFound);
  }

  const description = reason === null ? goToCursorLabel(name) : reason;

  function tooltipText(): string {
    if (isFailed) return cursorNotFoundMessage(name);
    return description;
  }

  return (
    <Tooltip open={isOpen || isFailed} onOpenChange={setIsOpen}>
      <span id={reasonId} className="sr-only">
        {description}
      </span>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={memberLabel(name)}
          aria-describedby={reasonId}
          aria-disabled={reason !== null}
          className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={jump}
        >
          <MemberAvatar member={member} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText()}</TooltipContent>
    </Tooltip>
  );
}

function MemberMenuItem({ state, onJump }: { state: JumpState; onJump: (member: DocumentMember) => JumpOutcome }) {
  const { member, reason } = state;
  return (
    <DropdownMenuItem disabled={reason !== null} onSelect={() => onJump(member)}>
      <MemberAvatar member={member} />
      <span className="flex flex-col">
        <span>{member.user.name}</span>
        {reason !== null && <span className="text-xs text-muted-foreground">{reason}</span>}
      </span>
    </DropdownMenuItem>
  );
}

function MembersMenu({ states, onJump }: { states: JumpState[]; onJump: (member: DocumentMember) => JumpOutcome }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" className="rounded-full text-xs" aria-label={moreMembersLabel(states.length)}>
          {overflowCountLabel(states.length)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {states.map((state) => (
          <MemberMenuItem key={state.member.user.id} state={state} onJump={onJump} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Members({
  documentId,
  members,
  currentUserId,
  superdoc,
  editorContainer,
  isPastVersion,
}: {
  documentId: string;
  members: DocumentMember[];
  currentUserId: string | null;
  superdoc: SuperDoc | null;
  editorContainer: HTMLElement | null;
  isPastVersion: boolean;
}) {
  const { hasCursor, jumpTo } = useMemberCursors({ superdoc, container: editorContainer });
  const queryClient = useQueryClient();
  const { schedule: refreshMembers } = useDebouncedCallback({
    callback: () => queryClient.invalidateQueries({ queryKey: membersQueryKey(documentId) }, { cancelRefetch: false }),
    delayMs: MEMBERS_PRESENCE_DEBOUNCE_MS,
  });
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!superdoc) return;
    function onAwarenessUpdate({ added, removed }: AwarenessChange): void {
      const hasPeerChange = added.length + removed.length > 0;
      if (!hasPeerChange) return;
      refreshMembers();
    }
    superdoc.on(AWARENESS_UPDATE_EVENT, onAwarenessUpdate);
    return () => {
      superdoc.off(AWARENESS_UPDATE_EVENT, onAwarenessUpdate);
    };
  }, [superdoc, refreshMembers]);

  function jump(member: DocumentMember): JumpOutcome {
    const outcome = jumpTo(member);
    setAnnouncement(outcome === JumpOutcome.Jumped ? movedToCursorMessage(member.user.name) : cursorNotFoundMessage(member.user.name));
    return outcome;
  }

  const states = members
    .filter((member) => member.online || member.user.id === currentUserId)
    .map((member): JumpState => {
      const isInDocument = hasCursor(member);
      return { member, reason: jumpReasonOf({ member, currentUserId, isPastVersion, isInDocument }) };
    });
  const isMedium = useMinWidth(MEDIUM_BREAKPOINT_PX);
  const maxWithoutMenu = isMedium ? MAX_MEMBERS_WITHOUT_MENU : NARROW_MEMBERS_WITHOUT_MENU;
  const besideMenu = isMedium ? MEMBERS_BESIDE_MENU : NARROW_MEMBERS_WITHOUT_MENU;
  const hasMenu = states.length > maxWithoutMenu;
  const visible = hasMenu ? states.slice(0, besideMenu) : states;
  const rest = hasMenu ? states.slice(besideMenu) : [];

  return (
    <div role="group" aria-label={onlineMembersLabel(states.length)} className="flex items-center gap-1">
      {visible.map((state) => (
        <MemberButton key={state.member.user.id} state={state} onJump={jump} />
      ))}
      {hasMenu && <MembersMenu states={rest} onJump={jump} />}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
