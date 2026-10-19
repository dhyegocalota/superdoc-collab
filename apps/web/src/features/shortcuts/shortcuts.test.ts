import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { ShortcutActionKind, ShortcutGroup, ShortcutId, shortcutOf, SHORTCUTS, type KeyCombination } from './shortcuts';

const CATALOG_DECLARATION_PATH = resolve('node_modules/superdoc/dist/superdoc/src/public/ui/commands.d.ts');
const CATALOG_ID_PATTERN = /readonly id: "([^"]+)"/g;
const ALL_IDS = Object.values(ShortcutId);

function combinationKey(combination: KeyCombination): string {
  return [...combination.modifiers].sort().join('+') + `+${combination.code}`;
}

test('every id has a definition with both platforms', () => {
  ALL_IDS.forEach((id) => {
    const definition = shortcutOf(id);
    expect(definition.id).toBe(id);
    expect(definition.keys.mac.code).not.toBe('');
    expect(definition.keys.other.code).not.toBe('');
  });
});

test('no key combination is used twice on one platform', () => {
  const macKeys = ALL_IDS.map((id) => combinationKey(shortcutOf(id).keys.mac));
  const otherKeys = ALL_IDS.map((id) => combinationKey(shortcutOf(id).keys.other));
  expect(new Set(macKeys).size).toBe(ALL_IDS.length);
  expect(new Set(otherKeys).size).toBe(ALL_IDS.length);
});

test('the registry holds every id exactly once and every group is used', () => {
  expect(SHORTCUTS.map((definition) => definition.id).sort()).toEqual([...ALL_IDS].sort());
  const usedGroups = new Set(SHORTCUTS.map((definition) => definition.group));
  expect([...usedGroups].sort()).toEqual(Object.values(ShortcutGroup).sort());
});

test('every command entry names a catalogued SuperDoc command', () => {
  const catalogIds = new Set([...readFileSync(CATALOG_DECLARATION_PATH, 'utf8').matchAll(CATALOG_ID_PATTERN)].map((match) => match[1]));
  const commandIds = SHORTCUTS.flatMap(({ action }) => (action.kind === ShortcutActionKind.Command ? [action.commandId] : []));
  expect(commandIds.length).toBeGreaterThan(0);
  commandIds.forEach((commandId) => expect(catalogIds.has(commandId)).toBe(true));
});
