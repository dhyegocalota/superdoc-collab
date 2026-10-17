import { VersionViewerState, VERSION_FAILED_MESSAGE } from '@superdoc-history/types';
import { Button } from '@/components/ui/button';
import { BACK_TO_LIVE_LABEL, LOADING_VERSION_MESSAGE, versionAtLabel } from '@/features/timeline/timeline-copy';
import type { TimeTravel } from '@/features/timeline/use-time-travel';
import { formatVersionMoment } from '@/lib/format-date-time';

function loadingMessage(timeTravel: TimeTravel): string {
  if (timeTravel.requestedBinEnd === null) return LOADING_VERSION_MESSAGE;
  return `${LOADING_VERSION_MESSAGE} ${formatVersionMoment(timeTravel.requestedBinEnd)}`;
}

function bannerMessage(timeTravel: TimeTravel): string {
  if (timeTravel.hasFailed) return VERSION_FAILED_MESSAGE;
  if (timeTravel.isLoading || !timeTravel.shown) return loadingMessage(timeTravel);
  return versionAtLabel(formatVersionMoment(timeTravel.shown.serverTime));
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
