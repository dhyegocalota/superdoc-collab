import { VersionViewerState, VERSION_FAILED_MESSAGE } from '@superdoc-history/types';
import { Button } from '@/components/ui/button';
import { BACK_TO_LIVE_LABEL, LOADING_VERSION_MESSAGE, versionAtLabel } from '@/features/timeline/timeline-copy';
import { formatTimestamp } from '@/features/timeline/timeline-tooltip';
import type { TimeTravel } from '@/features/timeline/use-time-travel';

const MOMENT_FORMAT = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const DATED_MOMENT_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function formatMoment(time: number): string {
  const isToday = new Date(time).toDateString() === new Date().toDateString();
  return (isToday ? MOMENT_FORMAT : DATED_MOMENT_FORMAT).format(time);
}

function loadingMessage(timeTravel: TimeTravel): string {
  if (timeTravel.requestedBinEnd === null) return LOADING_VERSION_MESSAGE;
  return `${LOADING_VERSION_MESSAGE} ${formatTimestamp(timeTravel.requestedBinEnd)}`;
}

function bannerMessage(timeTravel: TimeTravel): string {
  if (timeTravel.hasFailed) return VERSION_FAILED_MESSAGE;
  if (timeTravel.isLoading || !timeTravel.shown) return loadingMessage(timeTravel);
  return versionAtLabel(formatMoment(timeTravel.shown.serverTime));
}

export function VersionBanner({ timeTravel }: { timeTravel: TimeTravel }) {
  if (timeTravel.state === VersionViewerState.Live) return null;
  const message = bannerMessage(timeTravel);
  return (
    <div
      role="status"
      data-testid="version-banner"
      data-sequence={timeTravel.shown?.sequence}
      className="flex items-center justify-between gap-2 border-b bg-muted px-4 py-2 text-sm"
    >
      <p>{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={timeTravel.backToLive}>
        {BACK_TO_LIVE_LABEL}
      </Button>
    </div>
  );
}
