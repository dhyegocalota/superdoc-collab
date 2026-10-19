import type { ContextMenuConfig } from 'superdoc';
import type { Platform } from '@/lib/platform';

export function contextMenuShortcutProvider(platform: Platform): NonNullable<ContextMenuConfig['menuProvider']> {
  throw new Error(`contextMenuShortcutProvider is not implemented on ${platform}`);
}
