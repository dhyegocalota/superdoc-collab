import { detectPlatform, type Platform } from '@/lib/platform';
import { shortcutKeyParts } from './shortcut-keys';
import type { ShortcutId } from './shortcuts';

const PILL_CLASS = 'rounded border bg-muted px-1 py-0.5 font-mono text-[0.6875rem] leading-none text-muted-foreground';

export function ShortcutKeyPills({ shortcutId, platform }: { shortcutId: ShortcutId; platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1">
      {shortcutKeyParts({ id: shortcutId, platform }).map((part) => (
        <kbd key={part} className={PILL_CLASS}>
          {part}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutHint({ shortcutId }: { shortcutId: ShortcutId }) {
  return <ShortcutKeyPills shortcutId={shortcutId} platform={detectPlatform()} />;
}
