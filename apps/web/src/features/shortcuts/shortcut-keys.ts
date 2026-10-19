import type { Platform } from '@/lib/platform';
import type { ShortcutId } from './shortcuts';

export function shortcutKeyParts({ id, platform }: { id: ShortcutId; platform: Platform }): string[] {
  throw new Error(`shortcutKeyParts is not implemented for ${id} on ${platform}`);
}

export function shortcutLabel({ id, platform }: { id: ShortcutId; platform: Platform }): string {
  throw new Error(`shortcutLabel is not implemented for ${id} on ${platform}`);
}
