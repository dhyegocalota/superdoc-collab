import { expect, test } from 'vitest';
import { AUTHOR_COLOR_SLOT_COUNT, assignAuthorColorSlots, authorColorKeyOf, authorColorSlot } from './author-colors';

const SAMPLE_KEYS = ['u1', 'u2', 'u3', 'imported:chris crawford', 'user-ana', 'a', ''];
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_HASH_OF_A = 0xe40c292c;

test('authorColorKeyOf joins an agent to its person and imports by trimmed lowercase name', () => {
  expect(authorColorKeyOf({ id: 'u1', name: 'Ana' })).toBe('u1');
  expect(authorColorKeyOf({ id: 'u1#agent', name: 'Ana' })).toBe('u1');
  expect(authorColorKeyOf({ id: null, name: ' Chris Crawford ' })).toBe('imported:chris crawford');
  expect(authorColorKeyOf({ id: null, name: 'CHRIS crawford' })).toBe('imported:chris crawford');
});

test('authorColorSlot returns 1 to 6 and the same value on repeat', () => {
  const slots = SAMPLE_KEYS.map(authorColorSlot);
  expect(slots.every((slot) => Number.isInteger(slot) && slot >= 1 && slot <= AUTHOR_COLOR_SLOT_COUNT)).toBe(true);
  expect(SAMPLE_KEYS.map(authorColorSlot)).toEqual(slots);
});

test('authorColorSlot spreads many keys over all six slots', () => {
  const keys = Array.from({ length: 200 }, (_, index) => `user-${index}`);
  expect(new Set(keys.map(authorColorSlot)).size).toBe(AUTHOR_COLOR_SLOT_COUNT);
});

test('authorColorSlot follows the 32-bit FNV-1a of the key', () => {
  expect(authorColorSlot('a')).toBe((FNV_HASH_OF_A % AUTHOR_COLOR_SLOT_COUNT) + 1);
  expect(authorColorSlot('')).toBe((FNV_OFFSET_BASIS % AUTHOR_COLOR_SLOT_COUNT) + 1);
});

const MEMBERS_SHARING_SLOT_ONE = ['member-2', 'member-4', 'member-8', 'member-15', 'member-20', 'member-26', 'member-31'];

test('two members whose ids hash to one slot get two slots in join order', () => {
  const [first, second] = MEMBERS_SHARING_SLOT_ONE;
  const slots = assignAuthorColorSlots({ memberIds: [first, second] });
  expect(slots.get(first)).toBe(authorColorSlot(first));
  expect(slots.get(second)).toBe(authorColorSlot(first) + 1);
  const reversed = assignAuthorColorSlots({ memberIds: [second, first] });
  expect(reversed.get(second)).toBe(authorColorSlot(second));
  expect(reversed.get(first)).not.toBe(reversed.get(second));
});

test('six members get six distinct slots', () => {
  const memberIds = MEMBERS_SHARING_SLOT_ONE.slice(0, AUTHOR_COLOR_SLOT_COUNT);
  expect(new Set(assignAuthorColorSlots({ memberIds }).values()).size).toBe(AUTHOR_COLOR_SLOT_COUNT);
});

test('the seventh member takes its hash slot', () => {
  const slots = assignAuthorColorSlots({ memberIds: MEMBERS_SHARING_SLOT_ONE });
  const seventh = MEMBERS_SHARING_SLOT_ONE[AUTHOR_COLOR_SLOT_COUNT];
  expect(slots.get(seventh)).toBe(authorColorSlot(seventh));
});

test('an empty list is an empty map', () => {
  expect(assignAuthorColorSlots({ memberIds: [] }).size).toBe(0);
});
