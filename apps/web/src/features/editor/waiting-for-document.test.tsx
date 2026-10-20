import {
  AppRoute,
  BootstrapStage,
  documentPagePath,
  DOCUMENT_UNAVAILABLE_MESSAGE,
  HEAVY_ROOMS_FULL_MESSAGE,
  DocumentRole,
  type DocumentsList,
} from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ServerBusyError } from '@/lib/api';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { OpenStage } from '@/features/open-progress/open-stage';
import { bootstrapAt, DOCUMENT_ID, DOCUMENT_TITLE, summaryAs } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { BACK_TO_DOCUMENTS_LABEL, DOCUMENT_LOAD_ERROR_MESSAGE } from './editor-copy';
import { DocumentReadiness } from './use-opened-document';
import {
  DEVICE_STOPPED_HINT,
  deviceStoppedMessage,
  LOAD_RETRY_HINT,
  PREPARATION_FAILED_HINT,
  PREPARATION_FAILED_MESSAGE,
  TRY_AGAIN_LABEL,
} from './waiting-copy';
import { WaitingForDocument, type WaitingProgress, type WaitingReadiness } from './waiting-for-document';

const CACHED_LIST: DocumentsList = { mine: [], shared: [summaryAs(DocumentRole.Reader)] };
const TITLE_SKELETON_TEST_ID = 'waiting-title-skeleton';

const SHOWN_PROGRESS: WaitingProgress = {
  bootstrap: bootstrapAt(BootstrapStage.Preparing),
  preparedOnDeviceOf: null,
  answeredAt: Date.now(),
  startedAt: Date.now(),
  isShown: true,
};
const HIDDEN_PROGRESS: WaitingProgress = { ...SHOWN_PROGRESS, isShown: false };
const PROGRESS_TEST_ID = 'open-progress';

function renderWaiting({
  readiness,
  cached = false,
  progress = HIDDEN_PROGRESS,
  failure = null,
}: {
  readiness: WaitingReadiness;
  cached?: boolean;
  progress?: WaitingProgress;
  failure?: Error | null;
}) {
  const queryClient = new QueryClient();
  if (cached) queryClient.setQueryData(DOCUMENTS_QUERY_KEY, CACHED_LIST);
  const onRetry = vi.fn();
  const { router } = renderWithProviders(
    <WaitingForDocument
      documentId={DOCUMENT_ID}
      readiness={readiness}
      progress={progress}
      failure={failure}
      deviceRefusal={null}
      onRetry={onRetry}
    />,
    { queryClient, route: documentPagePath(DOCUMENT_ID) },
  );
  return { onRetry, router };
}

test('the waiting state shows the Preparing panel and Back to documents once the delay has passed', () => {
  renderWaiting({ readiness: DocumentReadiness.Waiting, progress: SHOWN_PROGRESS, cached: true });
  const panel = screen.getByTestId(PROGRESS_TEST_ID);
  expect(panel).toHaveAttribute('data-stage', OpenStage.Preparing);
  expect(within(panel).getByText(DOCUMENT_TITLE)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toHaveAttribute('href', AppRoute.Documents);
});

test('the waiting state shows no panel before the delay has passed', () => {
  renderWaiting({ readiness: DocumentReadiness.Waiting });
  expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).not.toBeInTheDocument();
  expect(screen.getByTestId(TITLE_SKELETON_TEST_ID)).toBeInTheDocument();
  expect(screen.getByRole('main')).toBeInTheDocument();
});

test('the error state shows the retry hint and Try again first', async () => {
  const { onRetry } = renderWaiting({ readiness: DocumentReadiness.Failed });
  const alert = screen.getByRole('alert');
  expect(within(alert).getByText(DOCUMENT_LOAD_ERROR_MESSAGE)).toBeInTheDocument();
  expect(within(alert).getByText(LOAD_RETRY_HINT)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: TRY_AGAIN_LABEL }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toBeInTheDocument();
});

test('a refusal because the server is holding as many large documents as it can shows its message with Try again and no connection hint', async () => {
  const { onRetry } = renderWaiting({ readiness: DocumentReadiness.Failed, failure: new ServerBusyError(HEAVY_ROOMS_FULL_MESSAGE) });
  const alert = screen.getByRole('alert');
  expect(within(alert).getByText(HEAVY_ROOMS_FULL_MESSAGE)).toBeInTheDocument();
  expect(within(alert).queryByText(DOCUMENT_LOAD_ERROR_MESSAGE)).not.toBeInTheDocument();
  expect(within(alert).queryByText(LOAD_RETRY_HINT)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: TRY_AGAIN_LABEL }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('a connection failure keeps the connection copy', () => {
  renderWaiting({ readiness: DocumentReadiness.Failed, progress: { ...SHOWN_PROGRESS, bootstrap: null } });
  expect(screen.queryByText(PREPARATION_FAILED_MESSAGE)).not.toBeInTheDocument();
  expect(screen.getByText(LOAD_RETRY_HINT)).toBeInTheDocument();
});

test('a failed preparation says the file could not be prepared, not that the connection failed, and offers no retry', () => {
  renderWaiting({ readiness: DocumentReadiness.Failed, progress: { ...SHOWN_PROGRESS, bootstrap: bootstrapAt(BootstrapStage.Failed) } });
  const alert = screen.getByRole('alert');
  expect(within(alert).getByText(PREPARATION_FAILED_MESSAGE)).toBeInTheDocument();
  expect(within(alert).getByText(PREPARATION_FAILED_HINT)).toBeInTheDocument();
  expect(screen.queryByText(LOAD_RETRY_HINT)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: TRY_AGAIN_LABEL })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toBeInTheDocument();
});

test('Escape on the Preparing panel goes back to the documents', async () => {
  const { router } = renderWaiting({ readiness: DocumentReadiness.Waiting, progress: SHOWN_PROGRESS });
  await userEvent.keyboard('{Escape}');
  expect(router.state.location.pathname).toBe(AppRoute.Documents);
});

test('an unavailable document shows its own message and no retry', () => {
  renderWaiting({ readiness: DocumentReadiness.Unavailable });
  expect(within(screen.getByRole('alert')).getByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: TRY_AGAIN_LABEL })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toBeInTheDocument();
});

test('the title shows when the documents cache holds it', () => {
  renderWaiting({ readiness: DocumentReadiness.Waiting, cached: true });
  expect(screen.getByText(DOCUMENT_TITLE)).toBeInTheDocument();
  expect(screen.queryByTestId(TITLE_SKELETON_TEST_ID)).not.toBeInTheDocument();
});

test('without a cached title a skeleton takes its place', () => {
  renderWaiting({ readiness: DocumentReadiness.Waiting });
  expect(screen.queryByText(DOCUMENT_TITLE)).not.toBeInTheDocument();
  expect(screen.getByTestId(TITLE_SKELETON_TEST_ID)).toBeInTheDocument();
});

test('a joiner is told whose device prepares the document', () => {
  renderWaiting({ readiness: DocumentReadiness.Waiting, progress: { ...SHOWN_PROGRESS, preparedOnDeviceOf: 'Ana' } });
  expect(screen.getByTestId('open-progress-detail')).toHaveTextContent("Being prepared on Ana's device");
});

test('a device job that stopped says whose device stopped, not that the file may be damaged', () => {
  renderWaiting({
    readiness: DocumentReadiness.Failed,
    progress: { ...HIDDEN_PROGRESS, bootstrap: bootstrapAt(BootstrapStage.Failed), preparedOnDeviceOf: 'Ana' },
  });
  expect(screen.getByRole('alert')).toHaveTextContent(deviceStoppedMessage('Ana'));
  expect(screen.getByText(DEVICE_STOPPED_HINT)).toBeInTheDocument();
  expect(screen.queryByText(PREPARATION_FAILED_HINT)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: TRY_AGAIN_LABEL })).not.toBeInTheDocument();
});
