import { ConnectionState, type ConnectionFailureReason } from '@superdoc-collab/types';
import { Check, Loader2, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  FAILED_TITLE,
  FAILURE_REASON_COPY,
  KEPT_AND_DATED_DETAIL,
  LOST_TITLE,
  RECONNECTING_TITLE,
  RECOVERED_TITLE,
  RELOAD_LABEL,
  RELOADING_LABEL,
  UNSYNCED_LOST_ON_RELOAD_DETAIL,
} from './connection-copy';

type ConnectionBannerProps = {
  state: ConnectionState;
  failureReason: ConnectionFailureReason | null;
  isReloading: boolean;
  onReload: () => void;
};

enum BannerRole {
  Status = 'status',
  Alert = 'alert',
}

type BannerState = Exclude<ConnectionState, ConnectionState.Online>;

type Presentation = {
  role: BannerRole;
  toneClassName: string;
  Icon: LucideIcon;
  iconClassName: string;
  title: string;
  detail: string | null;
};

const PRESENTATION: Record<BannerState, Presentation> = {
  [ConnectionState.Lost]: {
    role: BannerRole.Status,
    toneClassName: 'bg-muted',
    Icon: WifiOff,
    iconClassName: '',
    title: LOST_TITLE,
    detail: KEPT_AND_DATED_DETAIL,
  },
  [ConnectionState.Reconnecting]: {
    role: BannerRole.Status,
    toneClassName: 'bg-muted',
    Icon: Loader2,
    iconClassName: 'animate-spin motion-reduce:animate-none',
    title: RECONNECTING_TITLE,
    detail: KEPT_AND_DATED_DETAIL,
  },
  [ConnectionState.Recovered]: {
    role: BannerRole.Status,
    toneClassName: 'bg-online/15',
    Icon: Check,
    iconClassName: '',
    title: RECOVERED_TITLE,
    detail: null,
  },
  [ConnectionState.Failed]: {
    role: BannerRole.Alert,
    toneClassName: 'bg-destructive/10',
    Icon: TriangleAlert,
    iconClassName: 'text-destructive',
    title: FAILED_TITLE,
    detail: UNSYNCED_LOST_ON_RELOAD_DETAIL,
  },
};

export function ConnectionBanner({ state, failureReason, isReloading, onReload }: ConnectionBannerProps) {
  if (state === ConnectionState.Online) return null;
  const { role, toneClassName, Icon, iconClassName, title, detail } = PRESENTATION[state];
  const isFailed = state === ConnectionState.Failed;
  const reasonLine = isFailed && failureReason ? FAILURE_REASON_COPY[failureReason] : null;
  const body = [reasonLine, detail].filter((line) => line !== null).join(' ');
  return (
    <div
      role={role}
      data-testid="connection-banner"
      data-state={state}
      className={cn('flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm', toneClassName)}
    >
      <Icon aria-hidden className={cn('size-4 shrink-0', iconClassName)} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-medium">{title}</p>
        {body && <p className="text-xs text-muted-foreground">{body}</p>}
      </div>
      {isFailed && (
        <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={isReloading} onClick={onReload}>
          {isReloading ? RELOADING_LABEL : RELOAD_LABEL}
        </Button>
      )}
    </div>
  );
}
