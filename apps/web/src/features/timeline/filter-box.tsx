import { TimelineFilterKind, TimelineSearchParam } from '@superdoc-collab/types';
import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyboardKey } from '@/lib/keyboard';
import { CLEAR_FILTERS_LABEL, FILTER_LABEL, FILTER_PLACEHOLDER, removeFilterLabel } from './timeline-copy';
import { AUTHOR_PREFIX, parseFilterInput, useTimelineSearch } from './use-timeline-search';

const PARAM_BY_KIND: Record<TimelineFilterKind, TimelineSearchParam> = {
  [TimelineFilterKind.Term]: TimelineSearchParam.Term,
  [TimelineFilterKind.Author]: TimelineSearchParam.Author,
};

function chipText({ param, value }: { param: TimelineSearchParam; value: string }): string {
  if (param === TimelineSearchParam.Author) return `${AUTHOR_PREFIX}${value}`;
  return value;
}

export function FilterBox() {
  const { search, update } = useTimelineSearch();
  const [draft, setDraft] = useState('');
  const chips = [
    { param: TimelineSearchParam.Term, value: search.filter.term },
    { param: TimelineSearchParam.Author, value: search.filter.author },
  ].filter((chip) => chip.value !== null);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const isClearingDraft = event.key === KeyboardKey.Escape && event.currentTarget.value !== '';
    if (isClearingDraft) {
      event.preventDefault();
      setDraft('');
      return;
    }
    if (event.key !== KeyboardKey.Enter) return;
    const parsed = parseFilterInput(event.currentTarget.value);
    if (!parsed) return;
    update({ changes: { [PARAM_BY_KIND[parsed.kind]]: parsed.value }, replace: true });
    setDraft('');
  }

  function clearFilters(): void {
    update({ changes: { [TimelineSearchParam.Term]: null, [TimelineSearchParam.Author]: null }, replace: true });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-label={FILTER_LABEL}
        placeholder={FILTER_PLACEHOLDER}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((chip) => (
            <Button
              key={chip.param}
              type="button"
              variant="secondary"
              size="sm"
              aria-label={removeFilterLabel(chipText({ param: chip.param, value: chip.value! }))}
              onClick={() => update({ changes: { [chip.param]: null }, replace: true })}
            >
              {chipText({ param: chip.param, value: chip.value! })}
              <X />
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            {CLEAR_FILTERS_LABEL}
          </Button>
        </div>
      )}
    </div>
  );
}
