export const SETTINGS_HEADING = 'Settings';
export const SETTINGS_LINK_LABEL = 'Settings';
export const TIME_ZONE_HEADING = 'Time zone';
export const TIME_ZONE_FIELD_LABEL = 'Time zone';
export const USE_BROWSER_TIME_ZONE_LABEL = 'Use this';
export const SAVE_TIME_ZONE_LABEL = 'Save';
export const SAVING_TIME_ZONE_LABEL = 'Saving…';
export const TIME_ZONE_SAVED_TOAST = 'Time zone saved';
export const SAVE_TIME_ZONE_FAILED_MESSAGE = 'Could not save the time zone. Try again.';
export const FROM_BROWSER_SUFFIX = ' (from this browser)';

export function browserReportsMessage(timeZone: string): string {
  return `Your browser reports ${timeZone}`;
}

export function timesInLabel(timeZone: string): string {
  return `Times in ${timeZone}`;
}

export function unsupportedTimeZoneLabel(timeZone: string): string {
  return `${timeZone} (not recognized)`;
}
