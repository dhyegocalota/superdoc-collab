export const PUBLIC_LINK_SWITCH_LABEL = 'Anyone with the link can view';
export const PUBLIC_LINK_DESCRIPTION =
  'Anyone who has the link reads this document live without signing in. They cannot edit, comment, download or start a summary.';
export const PUBLIC_LINK_PRESENCE_NOTICE =
  'Anyone with the link sees the names of the people editing, and you see visitors as Anonymous animals.';
export const PUBLIC_LINK_CONTENT_NOTICE =
  'Comments and tracked changes, with the names and emails saved in them, are visible to anyone with the link.';
export const PUBLIC_LINK_ADDRESS_LABEL = 'Public link address';
export const PUBLIC_LINK_COPY_LABEL = 'Copy public link';
export const PUBLIC_LINK_LOADING_LABEL = 'Loading the public link setting';
export const PUBLIC_LINK_LOAD_FAILED_MESSAGE = 'The public link setting could not be loaded.';
export const PUBLIC_LINK_SWITCH_FAILED_MESSAGE = 'The public link could not be changed. Try again.';
export const PUBLIC_FLAG_SUBJECT = 'Public link setting';
export const PUBLIC_OPEN_SUBJECT = 'Public document request';
export const PUBLIC_MEMBERS_SUBJECT = 'Public members request';
export const PUBLIC_SUMMARY_SUBJECT = 'Public summary request';
export const PUBLIC_VIEW_ONLY_LABEL = 'View only';
export const PUBLIC_OPENING_MESSAGE = 'Opening the document';
export const PUBLIC_UNAVAILABLE_MESSAGE = 'This document is not available. The link may be wrong, or the owner may have turned it off.';
export const PUBLIC_RETRY_LABEL = 'Try again';
export const PUBLIC_CONNECTION_FAILED_MESSAGE = 'The live connection to this document was lost.';
export const PUBLIC_RELOAD_LABEL = 'Reload';
export const PUBLIC_LOAD_FAILED_MESSAGE = 'The document could not be opened.';

export function publicViewerLabel(name: string): string {
  return `You are ${name}`;
}

export function publicSummaryCaption(date: string): string {
  return `Latest summary, ${date}`;
}
