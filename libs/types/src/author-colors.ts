import type { EventAuthor } from './history';

export const AUTHOR_COLOR_SLOT_COUNT = 6;
const AGENT_KEY_SUFFIX = '#agent';
export const IMPORTED_KEY_PREFIX = 'imported:';
const HASH_OFFSET_BASIS = 0x811c9dc5;
const HASH_PRIME = 0x01000193;

const AUTHOR_COLOR_SLOTS = [1, 2, 3, 4, 5, 6] as const;

export type AuthorColorSlot = (typeof AUTHOR_COLOR_SLOTS)[number];

class UnknownAuthorColorSlotError extends Error {}

export function authorColorKeyOf({ id, name }: Pick<EventAuthor, 'id' | 'name'>): string {
  if (id === null) return `${IMPORTED_KEY_PREFIX}${name.trim().toLowerCase()}`;
  if (id.endsWith(AGENT_KEY_SUFFIX)) return id.slice(0, -AGENT_KEY_SUFFIX.length);
  return id;
}

export function authorColorSlot(key: string): AuthorColorSlot {
  const hash = new TextEncoder().encode(key).reduce((running, byte) => Math.imul(running ^ byte, HASH_PRIME) >>> 0, HASH_OFFSET_BASIS);
  const slot = AUTHOR_COLOR_SLOTS[hash % AUTHOR_COLOR_SLOT_COUNT];
  if (slot === undefined) throw new UnknownAuthorColorSlotError(key);
  return slot;
}

export function assignAuthorColorSlots({ memberIds }: { memberIds: string[] }): Map<string, AuthorColorSlot> {
  const slots = new Map<string, AuthorColorSlot>();
  memberIds.forEach((memberId) => {
    const hashSlot = authorColorSlot(memberId);
    const takenSlots = new Set(slots.values());
    const slotsFromHash = [...AUTHOR_COLOR_SLOTS.slice(hashSlot - 1), ...AUTHOR_COLOR_SLOTS.slice(0, hashSlot - 1)];
    const freeSlot = slotsFromHash.find((candidate) => !takenSlots.has(candidate));
    slots.set(memberId, freeSlot === undefined ? hashSlot : freeSlot);
  });
  return slots;
}
