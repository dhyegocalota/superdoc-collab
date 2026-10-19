import type { Platform } from '@/lib/platform';
import { KEY_SEPARATORS, MODIFIER_LABELS } from './shortcuts-copy';
import { shortcutOf, type ShortcutId } from './shortcuts';

export function shortcutKeyParts({ id, platform }: { id: ShortcutId; platform: Platform }): string[] {
  const { modifiers, label } = shortcutOf(id).keys[platform];
  return [...modifiers.map((modifier) => MODIFIER_LABELS[platform][modifier]), label];
}

export function shortcutLabel({ id, platform }: { id: ShortcutId; platform: Platform }): string {
  return shortcutKeyParts({ id, platform }).join(KEY_SEPARATORS[platform]);
}
