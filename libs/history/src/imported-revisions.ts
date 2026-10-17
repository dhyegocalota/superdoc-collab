import type { ImportedRevision } from './read-model';

// NB ADR 0024: Word writes w:date in UTC, so a date with no offset is UTC, never the process zone.
const OFFSET_LESS_DATE_TIME = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const UTC_DESIGNATOR = 'Z';
const SPACE_SEPARATED_DATE_TIME = /^(\d{4}-\d{2}-\d{2}) (?=\d{2}:)/;
export const MIN_REVISION_YEAR = 1900;
export const MAX_REVISION_YEAR = 9999;

export enum TrackedChangeType {
  Insertion = 'insertion',
  Deletion = 'deletion',
}

export type ListedTrackedChange = {
  id: string;
  type: TrackedChangeType;
  author: string;
  date: string;
  insertedText: string | null;
  deletedText: string | null;
  imported: boolean;
  navigationTarget: { blockId: string };
};

export class MissingTrackedChangeTextError extends Error {
  constructor(revisionId: string) {
    super(`Tracked change ${revisionId} has no text.`);
  }
}

export class InvalidRevisionDateError extends Error {
  constructor(revisionId: string) {
    super(`Tracked change ${revisionId} has an unreadable date.`);
  }
}

export function parseRevisionDate({ value, revisionId }: { value: string; revisionId: string }): number {
  const isoValue = value.replace(SPACE_SEPARATED_DATE_TIME, '$1T');
  const withOffset = OFFSET_LESS_DATE_TIME.test(isoValue) ? `${isoValue}${UTC_DESIGNATOR}` : isoValue;
  const time = Date.parse(withOffset);
  if (Number.isNaN(time)) throw new InvalidRevisionDateError(revisionId);
  const year = new Date(time).getUTCFullYear();
  if (year < MIN_REVISION_YEAR || year > MAX_REVISION_YEAR) throw new InvalidRevisionDateError(revisionId);
  return time;
}

function requireText({ text, revisionId }: { text: string | null; revisionId: string }): string {
  if (text === null) throw new MissingTrackedChangeTextError(revisionId);
  return text;
}

export function toImportedRevisions(items: ListedTrackedChange[]): ImportedRevision[] {
  return items.map((item) => {
    const isInsertion = item.type === TrackedChangeType.Insertion;
    const text = requireText({ text: isInsertion ? item.insertedText : item.deletedText, revisionId: item.id });
    return {
      revisionId: item.id,
      authorName: item.author,
      serverTime: parseRevisionDate({ value: item.date, revisionId: item.id }),
      blockId: item.navigationTarget.blockId,
      inserted: isInsertion ? text : '',
      deleted: isInsertion ? '' : text,
    };
  });
}
