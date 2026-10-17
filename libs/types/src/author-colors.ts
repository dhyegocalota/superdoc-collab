import type { EventAuthor } from './history';

export const AUTHOR_COLOR_SLOT_COUNT = 6;
export const AGENT_KEY_SUFFIX = '#agent';
export const HASH_OFFSET_BASIS = 0x811c9dc5;
export const HASH_PRIME = 0x01000193;

export type AuthorColorSlot = 1 | 2 | 3 | 4 | 5 | 6;

export function authorColorKeyOf(author: Pick<EventAuthor, 'id' | 'name'>): string {
  throw new Error(`authorColorKeyOf is not implemented for ${author.name}`);
}

export function authorColorSlot(key: string): AuthorColorSlot {
  throw new Error(`authorColorSlot is not implemented for ${key}`);
}
