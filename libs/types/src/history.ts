export enum BlockChangeKind {
  Created = 'created',
  Removed = 'removed',
  Modified = 'modified',
  Merged = 'merged',
}

export type EventAuthor = { id: string | null; name: string };
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
