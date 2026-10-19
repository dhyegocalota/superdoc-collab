import { LOADING_VERSION_MESSAGE } from '@/features/timeline/timeline-copy';
import type { TimeTravel } from '@/features/timeline/use-time-travel';
import { VersionBanner } from '@/features/versions/version-banner';

const VERSION_PROGRESS_CLASS = 'h-0.5 w-full animate-pulse bg-primary motion-reduce:animate-none';

export function VersionBar({
  timeTravel,
  timeZone,
  isLoadingRequestedVersion,
}: {
  timeTravel: TimeTravel;
  timeZone: string;
  isLoadingRequestedVersion: boolean;
}) {
  return (
    <>
      <VersionBanner timeTravel={timeTravel} timeZone={timeZone} />
      {isLoadingRequestedVersion && <div role="status" aria-label={LOADING_VERSION_MESSAGE} className={VERSION_PROGRESS_CLASS} />}
    </>
  );
}
