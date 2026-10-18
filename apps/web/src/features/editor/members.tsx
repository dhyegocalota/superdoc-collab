import { JUMP_FAILED_NOTICE_MS, type DocumentMember } from '@superdoc-collab/types';
import { useEffect, useId, useState } from 'react';
import type { SuperDoc } from 'superdoc';
import { UserAvatar, UserAvatarSize } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MEDIUM_BREAKPOINT_PX } from '@/lib/breakpoints';
import { useMinWidth } from '@/lib/use-min-width';
import {
  BACK_TO_LIVE_TO_JUMP_REASON,
  cursorNotFoundMessage,
  goToCursorLabel,
  memberLabel,
  moreMembersLabel,
  movedToCursorMessage,
  cursorOffScreenReason,
  offlineMemberReason,
  SELF_MEMBER_REASON,
} from './editor-copy';
import { overflowCountLabel } from './members-copy';
import { JumpOutcome, useMemberCursors } from './use-member-cursors';

const MAX_MEMBERS_WITHOUT_MENU = 5;
const MEMBERS_BESIDE_MENU = 4;
const NARROW_MEMBERS_WITHOUT_MENU = 3;

type JumpState = { member: DocumentMember; isOnline: boolean; reason: string | null };

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
  if (!member.online) return offlineMemberReason(name);
  if (!isInDocument) return cursorOffScreenReason(name);
  return null;
}

function MemberAvatar({ member, isOnline }: { member: DocumentMember; isOnline: boolean }) {
  return (
    <UserAvatar name={member.user.name} colorSlot={member.colorSlot} size={UserAvatarSize.Large} isAgent={false} isOnline={isOnline} />
  );
}

function MemberButton({ state, onJump }: { state: JumpState; onJump: (member: DocumentMember) => JumpOutcome }) {
  const { member, isOnline, reason } = state;
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

  function tooltipText(): string {
    if (isFailed) return cursorNotFoundMessage(name);
    if (reason !== null) return reason;
    return goToCursorLabel(name);
  }

  return (
    <Tooltip open={isOpen || isFailed} onOpenChange={setIsOpen}>
      {reason !== null && (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={reason === null ? goToCursorLabel(name) : memberLabel({ name, isOnline })}
          aria-describedby={reason === null ? undefined : reasonId}
          aria-disabled={reason !== null}
          className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={jump}
        >
          <MemberAvatar member={member} isOnline={isOnline} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText()}</TooltipContent>
    </Tooltip>
  );
}

function MemberMenuItem({ state, onJump }: { state: JumpState; onJump: (member: DocumentMember) => JumpOutcome }) {
  const { member, isOnline, reason } = state;
  return (
    <DropdownMenuItem disabled={reason !== null} onSelect={() => onJump(member)}>
      <MemberAvatar member={member} isOnline={isOnline} />
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
  const [announcement, setAnnouncement] = useState('');

  function jump(member: DocumentMember): JumpOutcome {
    const outcome = jumpTo(member);
    setAnnouncement(outcome === JumpOutcome.Jumped ? movedToCursorMessage(member.user.name) : cursorNotFoundMessage(member.user.name));
    return outcome;
  }

  const states = members.map((member): JumpState => {
    const isSelf = member.user.id === currentUserId;
    const isInDocument = hasCursor(member);
    return { member, isOnline: member.online || isSelf, reason: jumpReasonOf({ member, currentUserId, isPastVersion, isInDocument }) };
  });
  const isMedium = useMinWidth(MEDIUM_BREAKPOINT_PX);
  const maxWithoutMenu = isMedium ? MAX_MEMBERS_WITHOUT_MENU : NARROW_MEMBERS_WITHOUT_MENU;
  const besideMenu = isMedium ? MEMBERS_BESIDE_MENU : NARROW_MEMBERS_WITHOUT_MENU;
  const hasMenu = states.length > maxWithoutMenu;
  const visible = hasMenu ? states.slice(0, besideMenu) : states;
  const rest = hasMenu ? states.slice(besideMenu) : [];

  return (
    <div className="flex items-center gap-1">
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
