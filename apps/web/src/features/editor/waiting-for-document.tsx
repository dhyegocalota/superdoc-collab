import { AppRoute, BootstrapStage, DOCUMENT_UNAVAILABLE_MESSAGE, type DocumentsList } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { TriangleAlertIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { AppTopBar } from '@/components/app-top-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountMenu } from '@/features/account/account-menu';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { TickingOpenProgressPanel } from '@/features/open-progress/ticking-open-progress-panel';
import { preparingView } from '@/features/open-progress/open-progress-view';
import { EDITOR_OPEN_STAGES } from '@/features/open-progress/open-stage';
import type { BootstrapReading } from '@/features/open-progress/bootstrap-reading';
import { BackToDocumentsButton } from './back-to-documents-button';
import { LeaveOpeningButton } from './leave-opening-button';
import { BACK_TO_DOCUMENTS_LABEL, DOCUMENT_LOAD_ERROR_MESSAGE } from './editor-copy';
import { DocumentReadiness } from './use-opened-document';
import { LOAD_RETRY_HINT, PREPARATION_FAILED_HINT, PREPARATION_FAILED_MESSAGE, TRY_AGAIN_LABEL } from './waiting-copy';

export type WaitingProgress = { bootstrap: BootstrapReading | null; answeredAt: number; startedAt: number; isShown: boolean };

export type WaitingReadiness = DocumentReadiness.Waiting | DocumentReadiness.Failed | DocumentReadiness.Unavailable;

type WaitingActions = { onRetry: () => void };
type WaitingForDocumentProps = WaitingActions & { documentId: string; readiness: WaitingReadiness; progress: WaitingProgress };

const TITLE_SKELETON_TEST_ID = 'waiting-title-skeleton';
const PAGE_LINE_WIDTHS = ['w-2/5', 'w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-3/5'];

function cachedTitleOf({ documentList, documentId }: { documentList: DocumentsList | undefined; documentId: string }): string | null {
  if (!documentList) return null;
  const summary = [...documentList.mine, ...documentList.shared].find((candidate) => candidate.id === documentId);
  if (!summary) return null;
  return summary.title;
}

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
        preparingView({ bootstrap: progress.bootstrap, elapsedSeconds, startedAt: progress.startedAt, answeredAt: progress.answeredAt })
      }
      action={<LeaveOpeningButton />}
    />
  );
}

function FailedCard({ onRetry, progress }: WaitingActions & { progress: WaitingProgress }) {
  const isPreparationFailure = progress.bootstrap?.stage === BootstrapStage.Failed;
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

type CardInput = WaitingActions & { title: string | null; progress: WaitingProgress };

const CARD_BY_READINESS: Record<WaitingReadiness, (input: CardInput) => ReactElement | null> = {
  [DocumentReadiness.Waiting]: ({ title, progress }) => <PreparingCard title={title} progress={progress} />,
  [DocumentReadiness.Failed]: ({ progress, onRetry }) => <FailedCard progress={progress} onRetry={onRetry} />,
  [DocumentReadiness.Unavailable]: () => <UnavailableCard />,
};

export function WaitingForDocument({ documentId, readiness, progress, onRetry }: WaitingForDocumentProps) {
  const queryClient = useQueryClient();
  const title = cachedTitleOf({ documentList: queryClient.getQueryData<DocumentsList>(DOCUMENTS_QUERY_KEY), documentId });

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
        {CARD_BY_READINESS[readiness]({ title, progress, onRetry })}
      </main>
    </div>
  );
}
