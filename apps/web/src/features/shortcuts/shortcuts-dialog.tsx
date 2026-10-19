import { useId, useState, type RefObject } from 'react';
import type { SuperDoc } from 'superdoc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { detectPlatform, Platform } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { isShortcutAvailable } from './shortcut-availability';
import { ShortcutKeyPills } from './shortcut-hint';
import { shortcutLabel } from './shortcut-keys';
import { ShortcutGroup, SHORTCUTS, READER_SHORTCUT_GROUPS, type ShortcutDefinition } from './shortcuts';
import {
  PLATFORM_NOTE_LABELS,
  PLATFORM_TOGGLE_LABELS,
  SHORTCUT_GROUP_LABELS,
  SHORTCUT_LABELS,
  SHORTCUTS_DESCRIPTION,
  SHORTCUTS_EMPTY_MESSAGE,
  SHORTCUTS_SEARCH_LABEL,
  SHORTCUTS_TITLE,
  UNAVAILABLE_SHORTCUT_REASON,
} from './shortcuts-copy';

const OTHER_PLATFORM: Record<Platform, Platform> = { [Platform.Mac]: Platform.Other, [Platform.Other]: Platform.Mac };

export type ShortcutsDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  canEdit: boolean;
  superdoc: SuperDoc | null;
  returnFocusRef: RefObject<HTMLElement | null>;
};

function ShortcutRow({ definition, platform, isAvailable }: { definition: ShortcutDefinition; platform: Platform; isAvailable: boolean }) {
  return (
    <li className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', !isAvailable && 'text-muted-foreground')}>
      <span className="flex min-w-0 flex-col">
        <span>{SHORTCUT_LABELS[definition.id]}</span>
        {!isAvailable && <span className="text-xs">{UNAVAILABLE_SHORTCUT_REASON}</span>}
      </span>
      <span className="shrink-0 text-muted-foreground">
        <ShortcutKeyPills shortcutId={definition.id} platform={platform} />
      </span>
    </li>
  );
}

function ShortcutsDialogBody({ canEdit, superdoc }: { canEdit: boolean; superdoc: SuperDoc | null }) {
  const headingIdPrefix = useId();
  const [platform, setPlatform] = useState(detectPlatform);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = Object.values(ShortcutGroup).filter((group) => canEdit || READER_SHORTCUT_GROUPS.includes(group));

  function matchesQuery(definition: ShortcutDefinition): boolean {
    const searchableText = `${SHORTCUT_LABELS[definition.id]} ${shortcutLabel({ id: definition.id, platform })}`.toLowerCase();
    return searchableText.includes(normalizedQuery);
  }

  const sections = visibleGroups
    .map((group) => ({ group, rows: SHORTCUTS.filter((definition) => definition.group === group && matchesQuery(definition)) }))
    .filter(({ rows }) => rows.length > 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>{PLATFORM_NOTE_LABELS[platform]}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPlatform(OTHER_PLATFORM[platform])}>
          {PLATFORM_TOGGLE_LABELS[platform]}
        </Button>
      </div>
      <Input
        type="search"
        aria-label={SHORTCUTS_SEARCH_LABEL}
        placeholder={SHORTCUTS_SEARCH_LABEL}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {sections.length === 0 && <p className="text-sm text-muted-foreground">{SHORTCUTS_EMPTY_MESSAGE}</p>}
      {sections.map(({ group, rows }) => (
        <section key={group} aria-labelledby={`${headingIdPrefix}-${group}`}>
          <h3 id={`${headingIdPrefix}-${group}`} className="mb-1 text-sm font-semibold">
            {SHORTCUT_GROUP_LABELS[group]}
          </h3>
          <ul className="divide-y">
            {rows.map((definition) => (
              <ShortcutRow
                key={definition.id}
                definition={definition}
                platform={platform}
                isAvailable={isShortcutAvailable({ definition, superdoc })}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function ShortcutsDialog({ isOpen, onOpenChange, canEdit, superdoc, returnFocusRef }: ShortcutsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{SHORTCUTS_TITLE}</DialogTitle>
          <DialogDescription>{SHORTCUTS_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <ShortcutsDialogBody canEdit={canEdit} superdoc={superdoc} />
      </DialogContent>
    </Dialog>
  );
}
