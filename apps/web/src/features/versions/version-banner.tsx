import { VersionViewerState, VERSION_FAILED_MESSAGE } from '@superdoc-collab/types';
import { Button } from '@/components/ui/button';
import { BACK_TO_LIVE_LABEL, LOADING_VERSION_MESSAGE, uploadedVersionLabel, versionAtLabel } from '@/features/timeline/timeline-copy';
import type { TimeTravel } from '@/features/timeline/use-time-travel';
import { formatVersionMoment } from '@/lib/format-date-time';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';

function loadingMessage({ timeTravel, timeZone }: { timeTravel: TimeTravel; timeZone: string }): string {
  if (timeTravel.requestedBinEnd === null) return LOADING_VERSION_MESSAGE;
  return `${LOADING_VERSION_MESSAGE} ${formatVersionMoment({ time: timeTravel.requestedBinEnd, timeZone })}`;
}

function bannerMessage({ timeTravel, timeZone }: { timeTravel: TimeTravel; timeZone: string }): string {
  if (timeTravel.hasFailed) return VERSION_FAILED_MESSAGE;
  if (timeTravel.isLoading || !timeTravel.shownVersion) return loadingMessage({ timeTravel, timeZone });
  const moment = formatVersionMoment({ time: timeTravel.shownVersion.serverTime, timeZone });
  const isUploadedVersion = timeTravel.requestedBinEnd !== null && timeTravel.requestedBinEnd <= timeTravel.shownVersion.serverTime;
  if (isUploadedVersion) return uploadedVersionLabel(moment);
  return versionAtLabel(moment);
}

export function VersionBanner({ timeTravel, timeZone }: { timeTravel: TimeTravel; timeZone: string }) {
  const isPhoneLayout = useIsPhoneLayout();
  if (timeTravel.state === VersionViewerState.Live) return null;
  const message = bannerMessage({ timeTravel, timeZone });
  return (
    <div
      role="status"
      data-testid="version-banner"
      data-sequence={timeTravel.shownVersion?.sequence}
      className="flex items-center justify-between gap-2 border-b bg-muted px-4 py-2 text-sm"
    >
      <p>{message}</p>
      <Button type="button" variant="outline" size={isPhoneLayout ? 'touch' : 'sm'} onClick={timeTravel.backToLive}>
        {BACK_TO_LIVE_LABEL}
      </Button>
    </div>
  );
}
