import type { DocumentMember } from '@superdoc-collab/types';
import type { SuperDoc } from 'superdoc';

export enum JumpOutcome {
  Jumped = 'jumped',
  NotFound = 'not-found',
}

export function useMemberCursors(_parameters: { superdoc: SuperDoc | null; container: HTMLElement | null }): {
  namesWithCursor: ReadonlySet<string>;
  jumpTo: (member: DocumentMember) => JumpOutcome;
} {
  throw new Error('useMemberCursors is not implemented');
}
