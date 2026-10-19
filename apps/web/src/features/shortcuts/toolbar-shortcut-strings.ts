import type { ToolbarStringId } from 'superdoc';
import type { Platform } from '@/lib/platform';

export function toolbarShortcutStrings(platform: Platform): Partial<Record<ToolbarStringId, string>> {
  throw new Error(`toolbarShortcutStrings is not implemented on ${platform}`);
}
