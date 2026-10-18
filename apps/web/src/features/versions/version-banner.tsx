import { VersionViewerState, VERSION_FAILED_MESSAGE } from '@superdoc-collab/types';
import { Button } from '@/components/ui/button';
import { LARGE_BREAKPOINT_PX } from '@/lib/breakpoints';
import { BACK_TO_LIVE_LABEL, LOADING_VERSION_MESSAGE, versionAtLabel } from '@/features/timeline/timeline-copy';
import type { TimeTravel } from '@/features/timeline/use-time-travel';
import { formatVersionMoment } from '@/lib/format-date-time';
import { useMinWidth } from '@/lib/use-min-width';
import { useTimeZone } from '@/lib/use-time-zone';
import { cn } from '@/lib/utils';

const PHONE_BAR_CLASS = 'sticky top-0 z-10 min-h-11';

function loadingMessage({ timeTravel, timeZone }: { timeTravel: TimeTravel; timeZone: string }): string {
  if (timeTravel.requestedBinEnd === null) return LOADING_VERSION_MESSAGE;
  return `${LOADING_VERSION_MESSAGE} ${formatVersionMoment({ time: timeTravel.requestedBinEnd, timeZone })}`;
}

function bannerMessage({ timeTravel, timeZone }: { timeTravel: TimeTravel; timeZone: string }): string {
  if (timeTravel.hasFailed) return VERSION_FAILED_MESSAGE;
  if (timeTravel.isLoading || !timeTravel.shownVersion) return loadingMessage({ timeTravel, timeZone });
  return versionAtLabel(formatVersionMoment({ time: timeTravel.shownVersion.serverTime, timeZone }));
}

export function VersionBanner({ timeTravel }: { timeTravel: TimeTravel }) {
  const { timeZone } = useTimeZone();
  const isPhoneLayout = !useMinWidth(LARGE_BREAKPOINT_PX);
  if (timeTravel.state === VersionViewerState.Live) return null;
  const message = bannerMessage({ timeTravel, timeZone });
  return (
    <div
      role="status"
      data-testid="version-banner"
      data-sequence={timeTravel.shownVersion?.sequence}
      className={cn('flex items-center justify-between gap-2 border-b bg-muted px-4 py-2 text-sm', isPhoneLayout && PHONE_BAR_CLASS)}
    >
      <p>{message}</p>
      <Button type="button" variant="outline" size={isPhoneLayout ? 'touch' : 'sm'} onClick={timeTravel.backToLive}>
        {BACK_TO_LIVE_LABEL}
      </Button>
    </div>
  );
}
