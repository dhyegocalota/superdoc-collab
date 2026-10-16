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
export const RESIZE_PANEL_LABEL = 'Resize timeline panel';

export function requestFailedMessage({ subject, status }: { subject: string; status: number }): string {
  return `${subject} failed with status ${status}`;
}
