import {
  FILTER_MAX_LENGTH,
  NON_NEGATIVE_INTEGER_PATTERN,
  presentOrNull,
  TimelineFilterKind,
  TimelineSearchParam,
  type TimelineFilter,
} from '@superdoc-collab/types';
import { useSearchParams } from 'react-router';

export const AUTHOR_PREFIX = '@';

export type TimelineSearch = { filter: TimelineFilter; at: number | null; topic: string | null };
export type TimelineSearchChanges = Partial<Record<TimelineSearchParam, string | null>>;

export function parseFilterInput(value: string): { kind: TimelineFilterKind; value: string } | null {
  const trimmed = value.trim();
  const isAuthor = trimmed.startsWith(AUTHOR_PREFIX);
  const content = (isAuthor ? trimmed.slice(AUTHOR_PREFIX.length) : trimmed).trim().slice(0, FILTER_MAX_LENGTH);
  if (!content) return null;
  return { kind: isAuthor ? TimelineFilterKind.Author : TimelineFilterKind.Term, value: content };
}

function readBinStart(value: string | null): number | null {
  if (!value || !NON_NEGATIVE_INTEGER_PATTERN.test(value)) return null;
  return Number(value);
}

export function useTimelineSearch(): {
  search: TimelineSearch;
  update: (options: { changes: TimelineSearchChanges; replace: boolean }) => void;
} {
  const [params, setParams] = useSearchParams();
  const search: TimelineSearch = {
    filter: { term: presentOrNull(params.get(TimelineSearchParam.Term)), author: presentOrNull(params.get(TimelineSearchParam.Author)) },
    at: readBinStart(params.get(TimelineSearchParam.At)),
    topic: presentOrNull(params.get(TimelineSearchParam.Topic)),
  };

  function update({ changes, replace }: { changes: TimelineSearchChanges; replace: boolean }): void {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        next.delete(key);
        return;
      }
      next.set(key, value);
    });
    setParams(next, { replace });
  }

  return { search, update };
}
