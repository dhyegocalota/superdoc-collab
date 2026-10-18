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

const FIRST_MEMBER = 'member-2';
const SECOND_MEMBER = 'member-4';
const MEMBERS_SHARING_SLOT_ONE = [FIRST_MEMBER, SECOND_MEMBER, 'member-8', 'member-15', 'member-20', 'member-26'];
const SEVENTH_MEMBER = 'member-31';

test('two members whose ids hash to one slot get two slots in join order', () => {
  const slots = assignAuthorColorSlots({ memberIds: [FIRST_MEMBER, SECOND_MEMBER] });
  expect(slots.get(FIRST_MEMBER)).toBe(authorColorSlot(FIRST_MEMBER));
  expect(slots.get(SECOND_MEMBER)).toBe(authorColorSlot(FIRST_MEMBER) + 1);
  const reversed = assignAuthorColorSlots({ memberIds: [SECOND_MEMBER, FIRST_MEMBER] });
  expect(reversed.get(SECOND_MEMBER)).toBe(authorColorSlot(SECOND_MEMBER));
  expect(reversed.get(FIRST_MEMBER)).not.toBe(reversed.get(SECOND_MEMBER));
});

test('six members get six distinct slots', () => {
  const slots = assignAuthorColorSlots({ memberIds: MEMBERS_SHARING_SLOT_ONE });
  expect(new Set(slots.values()).size).toBe(AUTHOR_COLOR_SLOT_COUNT);
});

test('the seventh member takes its hash slot', () => {
  const slots = assignAuthorColorSlots({ memberIds: [...MEMBERS_SHARING_SLOT_ONE, SEVENTH_MEMBER] });
  expect(slots.get(SEVENTH_MEMBER)).toBe(authorColorSlot(SEVENTH_MEMBER));
});

test('an empty list is an empty map', () => {
  expect(assignAuthorColorSlots({ memberIds: [] }).size).toBe(0);
});

const FIRST_SLOT_SIX_MEMBER = 'member-3';
const SECOND_SLOT_SIX_MEMBER = 'member-5';

test('a collision on slot six wraps to slot one', () => {
  const slots = assignAuthorColorSlots({ memberIds: [FIRST_SLOT_SIX_MEMBER, SECOND_SLOT_SIX_MEMBER] });
  expect([slots.get(FIRST_SLOT_SIX_MEMBER), slots.get(SECOND_SLOT_SIX_MEMBER)]).toEqual([AUTHOR_COLOR_SLOT_COUNT, 1]);
});
