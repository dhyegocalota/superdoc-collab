import type { ReactNode } from 'react';
import type { Platform } from '@/lib/platform';
import type { ShortcutId } from './shortcuts';

export function ShortcutKeyPills({ shortcutId, platform }: { shortcutId: ShortcutId; platform: Platform }): ReactNode {
  throw new Error(`ShortcutKeyPills is not implemented for ${shortcutId} on ${platform}`);
}

export function ShortcutHint({ shortcutId }: { shortcutId: ShortcutId }): ReactNode {
  throw new Error(`ShortcutHint is not implemented for ${shortcutId}`);
}
