import { type BootstrapProgress, BootstrapStage, DOCUMENT_UNAVAILABLE_MESSAGE } from '@superdoc-collab/types';
import { TriangleAlertIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { AppTopBar } from '@/components/app-top-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ServerBusyError } from '@/lib/api';
import { AccountMenu } from '@/features/account/account-menu';
import { DEVICE_REFUSAL_COPY } from '@/features/local-preview/local-preview-copy';
import type { DeviceRefusal } from '@/features/local-preview/device-guard';
import { TickingOpenProgressPanel } from '@/features/open-progress/ticking-open-progress-panel';
import { preparingView } from '@/features/open-progress/open-progress-view';
import { EDITOR_OPEN_STAGES } from '@/features/open-progress/open-stage';
import { BackToDocumentsButton } from './back-to-documents-button';
import { LeaveOpeningButton } from './leave-opening-button';
import { BACK_TO_DOCUMENTS_LABEL, DOCUMENT_LOAD_ERROR_MESSAGE } from './editor-copy';
import { useCachedTitle } from './use-cached-title';
import { DocumentReadiness } from './use-opened-document';
import {
  DEVICE_STOPPED_HINT,
  deviceStoppedMessage,
  LOAD_RETRY_HINT,
  PREPARATION_FAILED_HINT,
  PREPARATION_FAILED_MESSAGE,
  TRY_AGAIN_LABEL,
} from './waiting-copy';

export type WaitingProgress = {
  bootstrap: BootstrapProgress | null;
  preparedOnDeviceOf: string | null;
  answeredAt: number;
  startedAt: number;
  isShown: boolean;
};

export type WaitingReadiness = DocumentReadiness.Waiting | DocumentReadiness.Failed | DocumentReadiness.Unavailable;

type WaitingActions = { onRetry: () => void };
type WaitingForDocumentProps = WaitingActions & {
  documentId: string;
  readiness: WaitingReadiness;
  progress: WaitingProgress;
  failure: Error | null;
  deviceRefusal: DeviceRefusal | null;
};

const TITLE_SKELETON_TEST_ID = 'waiting-title-skeleton';
const PAGE_LINE_WIDTHS = ['w-2/5', 'w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-3/5'];

function StatusCard({
  role,
  icon,
  heading,
  hint,
  actions,
}: {
  role: 'status' | 'alert';
  icon: ReactNode;
  heading: string;
  hint?: string;
  actions: ReactNode;
}) {
  return (
    <Card className="absolute top-16 left-1/2 w-[calc(100%-2rem)] max-w-105 -translate-x-1/2 gap-4 sm:top-30">
      <CardContent role={role} className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-semibold">
          {icon}
          {heading}
        </p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">{actions}</CardFooter>
    </Card>
  );
}

function PreparingCard({ title, progress }: { title: string | null; progress: WaitingProgress }) {
  if (!progress.isShown) return null;
  return (
    <TickingOpenProgressPanel
      title={title}
      stages={EDITOR_OPEN_STAGES}
      startedAt={progress.startedAt}
      viewAt={(elapsedSeconds) =>
        preparingView({
          bootstrap: progress.bootstrap,
          elapsedSeconds,
          startedAt: progress.startedAt,
          answeredAt: progress.answeredAt,
          preparedOnDeviceOf: progress.preparedOnDeviceOf,
        })
      }
      action={<LeaveOpeningButton />}
    />
  );
}

function FailedCard({ onRetry, progress, failure }: WaitingActions & { progress: WaitingProgress; failure: Error | null }) {
  const isPreparationFailure = progress.bootstrap?.stage === BootstrapStage.Failed;
  const stoppedDeviceOwner = isPreparationFailure ? progress.preparedOnDeviceOf : null;
  if (failure instanceof ServerBusyError) {
    return (
      <StatusCard
        role="alert"
        icon={<TriangleAlertIcon aria-hidden="true" className="size-4 text-destructive" />}
        heading={failure.message}
        actions={
          <>
            <Button onClick={onRetry}>{TRY_AGAIN_LABEL}</Button>
            <BackToDocumentsButton />
          </>
        }
      />
    );
  }
  if (stoppedDeviceOwner !== null) {
    return (
      <StatusCard
        role="alert"
        icon={<TriangleAlertIcon aria-hidden="true" className="size-4 text-destructive" />}
        heading={deviceStoppedMessage(stoppedDeviceOwner)}
        hint={DEVICE_STOPPED_HINT}
        actions={<BackToDocumentsButton />}
      />
    );
  }
  return (
    <StatusCard
      role="alert"
      icon={<TriangleAlertIcon aria-hidden="true" className="size-4 text-destructive" />}
      heading={isPreparationFailure ? PREPARATION_FAILED_MESSAGE : DOCUMENT_LOAD_ERROR_MESSAGE}
      hint={isPreparationFailure ? PREPARATION_FAILED_HINT : LOAD_RETRY_HINT}
      actions={
        <>
          {!isPreparationFailure && <Button onClick={onRetry}>{TRY_AGAIN_LABEL}</Button>}
          <BackToDocumentsButton />
        </>
      }
    />
  );
}

function DeviceRefusedCard({ refusal }: { refusal: DeviceRefusal }) {
  return (
    <StatusCard
      role="alert"
      icon={<TriangleAlertIcon aria-hidden="true" className="size-4 text-destructive" />}
      heading={DEVICE_REFUSAL_COPY[refusal]}
      actions={<BackToDocumentsButton />}
    />
  );
}

function UnavailableCard() {
  return (
    <StatusCard
      role="alert"
      icon={<TriangleAlertIcon aria-hidden="true" className="size-4 text-destructive" />}
      heading={DOCUMENT_UNAVAILABLE_MESSAGE}
      actions={<BackToDocumentsButton />}
    />
  );
}

type CardInput = WaitingActions & { title: string | null; progress: WaitingProgress; failure: Error | null };

const CARD_BY_READINESS: Record<WaitingReadiness, (input: CardInput) => ReactElement | null> = {
  [DocumentReadiness.Waiting]: ({ title, progress }) => <PreparingCard title={title} progress={progress} />,
  [DocumentReadiness.Failed]: ({ progress, failure, onRetry }) => <FailedCard progress={progress} failure={failure} onRetry={onRetry} />,
  [DocumentReadiness.Unavailable]: () => <UnavailableCard />,
};

export function WaitingForDocument({ documentId, readiness, progress, failure, deviceRefusal, onRetry }: WaitingForDocumentProps) {
  const title = useCachedTitle(documentId);

  return (
    <div className="flex h-full flex-col">
      <AppTopBar
        left={
          <>
            {title && <span className="truncate text-sm font-medium">{title}</span>}
            {!title && <Skeleton data-testid={TITLE_SKELETON_TEST_ID} className="h-8 w-full max-w-sm" />}
          </>
        }
        right={<AccountMenu colorSlot={null} />}
      />
      <div aria-hidden="true" className="flex border-b px-4 py-2">
        <Skeleton className="h-8 w-full max-w-md" />
      </div>
      <main className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-muted p-4">
        <div aria-hidden="true" className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-3 bg-paper p-8 shadow-sm sm:p-12">
          {PAGE_LINE_WIDTHS.map((width, index) => (
            <Skeleton key={`${width}-${index}`} className={`h-3 ${width}`} />
          ))}
        </div>
        {deviceRefusal === null ? (
          CARD_BY_READINESS[readiness]({ title, progress, failure, onRetry })
        ) : (
          <DeviceRefusedCard refusal={deviceRefusal} />
        )}
      </main>
    </div>
  );
}
