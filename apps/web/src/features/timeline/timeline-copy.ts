export { VERSION_FAILED_MESSAGE } from '@superdoc-history/types';

export const TIMELINE_HEADING = 'Timeline';
export const REFRESH_TOPICS_LABEL = 'Refresh topics';
export const RETRY_TOPICS_LABEL = 'Retry';
export const FILTER_LABEL = 'Filter';
export const FILTER_PLACEHOLDER = 'Filter by text or @person';
export const CLEAR_FILTERS_LABEL = 'Clear filters';
export const REMOVE_FILTER_LABEL = 'Remove filter';
export const TOP_EDITS_LABEL = 'Top edits';
export const NO_EDITS_YET_MESSAGE = 'No edits yet';
export const NO_EDITS_IN_BIN_MESSAGE = 'No edits in this period';
export const STREAMGRAPH_TITLE = 'Edits over time by topic';
export const BACK_TO_LIVE_LABEL = 'Back to live';
export const LOADING_VERSION_MESSAGE = 'Loading this version…';
export const VERSION_FRAME_TITLE = 'Document version';
export const RESIZE_PANEL_LABEL = 'Resize timeline panel';
export const SUMMARIZE_EDITS_LABEL = 'Summarize edits';
export const SELECTION_SUMMARY_HEADING = 'Summary of these edits';
export const EARLIER_STATE_LABEL = 'For an earlier state';
export const RETRY_SUMMARY_LABEL = 'Retry summary';
export const SUMMARIZING_EDITS_MESSAGE = 'Summarizing edits…';
export const NO_EDITS_TO_SUMMARIZE_MESSAGE = 'No edits to summarize';
export const SUMMARY_UP_TO_DATE_MESSAGE = 'The summary is up to date';
export const SUMMARIES_UNAVAILABLE_MESSAGE = 'Summaries are unavailable';
export const CHART_HINT = 'Click the chart or use ← → to see the document at that moment.';
export const LEGEND_LABEL = 'Topics';

const INSERTED_SIGN = '+';
const DELETED_SIGN = '−';
const SINGLE_COUNT = 1;

export enum EditUnit {
  Word = 'word',
  Character = 'character',
}

const UNIT_LABELS: Record<EditUnit, { one: string; many: string }> = {
  [EditUnit.Word]: { one: 'word', many: 'words' },
  [EditUnit.Character]: { one: 'character', many: 'characters' },
};

export function requestFailedMessage({ subject, status }: { subject: string; status: number }): string {
  return `${subject} failed with status ${status}`;
}

export function bandAriaLabel({ name, volume }: { name: string; volume: number }): string {
  return `${name}, ${countLabel({ count: volume, unit: EditUnit.Character })}`;
}

export function streamgraphDescription({ bandCount, from, to }: { bandCount: number; from: string; to: string }): string {
  return `${bandCount} bands, from ${from} to ${to}`;
}

export function removeFilterLabel(value: string): string {
  return `${REMOVE_FILTER_LABEL} ${value}`;
}

export function countLabel({ count, unit }: { count: number; unit: EditUnit }): string {
  if (count === SINGLE_COUNT) return `${count} ${UNIT_LABELS[unit].one}`;
  return `${count} ${UNIT_LABELS[unit].many}`;
}

export function editDeltaLabel({ inserted, deleted, unit }: { inserted: number; deleted: number; unit: EditUnit }): string {
  const sides = [
    { sign: INSERTED_SIGN, count: inserted },
    { sign: DELETED_SIGN, count: deleted },
  ].filter((side) => side.count > 0);
  if (sides.length === 0) return countLabel({ count: 0, unit });
  return sides.map((side) => `${side.sign}${countLabel({ count: side.count, unit })}`).join(' ');
}

export function lagBehindLabel(seconds: number): string {
  return `${seconds} s behind`;
}

export function versionAtLabel(moment: string): string {
  return `Version at ${moment}`;
}

export function retryInLabel(seconds: number): string {
  return `Try again in ${seconds} s.`;
}
