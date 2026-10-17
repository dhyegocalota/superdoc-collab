import { authorColorKeyOf, authorColorSlot, JUMP_FAILED_NOTICE_MS, type DocumentMember } from '@superdoc-collab/types';
import { useEffect, useMemo, useState } from 'react';
import type { SuperDoc } from 'superdoc';
import { UserAvatar, UserAvatarSize } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BACK_TO_LIVE_TO_JUMP_REASON,
  cursorNotFoundMessage,
  goToCursorLabel,
  memberLabel,
  moreMembersLabel,
  movedToCursorMessage,
  notInDocumentReason,
  offlineMemberReason,
  SELF_MEMBER_REASON,
} from './editor-copy';
import { overflowCountLabel } from './members-copy';
import { JumpOutcome, useMemberCursors } from './use-member-cursors';

const EDITOR_CONTAINER_SELECTOR = '[data-testid="document-editor"]';
const MAX_MEMBERS_WITHOUT_MENU = 5;
const MEMBERS_BESIDE_MENU = 4;

type JumpState = { member: DocumentMember; isOnline: boolean; reason: string | null };

function jumpReasonOf({
  member,
  currentUserId,
  isPastVersion,
  hasCursor,
}: {
  member: DocumentMember;
  currentUserId: string | null;
  isPastVersion: boolean;
  hasCursor: boolean;
}): string | null {
  const name = member.user.name;
  if (isPastVersion) return BACK_TO_LIVE_TO_JUMP_REASON;
  if (member.user.id === currentUserId) return SELF_MEMBER_REASON;
  if (!member.online) return offlineMemberReason(name);
  if (!hasCursor) return notInDocumentReason(name);
  return null;
}

function MemberAvatar({ member, isOnline }: { member: DocumentMember; isOnline: boolean }) {
  const { id, name } = member.user;
  return (
    <UserAvatar
      name={name}
      colorSlot={authorColorSlot(authorColorKeyOf({ id, name }))}
      size={UserAvatarSize.Large}
      isAgent={false}
      isOnline={isOnline}
    />
  );
}

function MemberButton({ state, onJump }: { state: JumpState; onJump: (member: DocumentMember) => JumpOutcome }) {
  const { member, isOnline, reason } = state;
  const name = member.user.name;
  const [isOpen, setIsOpen] = useState(false);
  const [isFailed, setIsFailed] = useState(false);

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
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={reason === null ? goToCursorLabel(name) : memberLabel({ name, isOnline })}
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
  members,
  currentUserId,
  superdoc,
  isPastVersion,
}: {
  members: DocumentMember[];
  currentUserId: string | null;
  superdoc: SuperDoc | null;
  isPastVersion: boolean;
}) {
  const container = useMemo(() => (superdoc ? document.querySelector<HTMLElement>(EDITOR_CONTAINER_SELECTOR) : null), [superdoc]);
  const { hasCursor, jumpTo } = useMemberCursors({ superdoc, container });
  const [announcement, setAnnouncement] = useState('');

  function jump(member: DocumentMember): JumpOutcome {
    const outcome = jumpTo(member);
    setAnnouncement(outcome === JumpOutcome.Jumped ? movedToCursorMessage(member.user.name) : cursorNotFoundMessage(member.user.name));
    return outcome;
  }

  const states = members.map((member): JumpState => {
    const isSelf = member.user.id === currentUserId;
    const hasCursor = hasCursor(member);
    return { member, isOnline: member.online || isSelf, reason: jumpReasonOf({ member, currentUserId, isPastVersion, hasCursor }) };
  });
  const hasMenu = states.length > MAX_MEMBERS_WITHOUT_MENU;
  const visible = hasMenu ? states.slice(0, MEMBERS_BESIDE_MENU) : states;
  const rest = hasMenu ? states.slice(MEMBERS_BESIDE_MENU) : [];

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
