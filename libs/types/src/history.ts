import type { AgentActionKind, ClientActor } from './agent';

export enum BlockChangeKind {
  Created = 'created',
  Removed = 'removed',
  Modified = 'modified',
  Merged = 'merged',
}

export type AgentActionMark = { userId: string; kind: AgentActionKind; createdAt: number };
export type EventAuthor = { id: string | null; name: string; actor: ClientActor };
export type DocumentEditEvent = {
  id: number;
  sequence: number;
  serverTime: number;
  authors: EventAuthor[];
  blockId: string;
  kind: BlockChangeKind;
  inserted: string;
  deleted: string;
  imported: boolean;
};
export type DocumentEditEvents = { events: DocumentEditEvent[]; cursor: number | null; nextAfterSequence: number | null };
