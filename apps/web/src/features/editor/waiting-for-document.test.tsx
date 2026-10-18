import { AppRoute, DOCUMENT_UNAVAILABLE_MESSAGE, DocumentRole, type DocumentsList } from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { DOCUMENT_ID, DOCUMENT_TITLE, summaryAs } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { BACK_TO_DOCUMENTS_LABEL, DOCUMENT_LOAD_ERROR_MESSAGE } from './editor-copy';
import { DocumentReadiness } from './use-opened-document';
import {
  KEEP_WAITING_LABEL,
  LOAD_RETRY_HINT,
  NOT_READY_PAUSED_HEADING,
  NOT_READY_PAUSED_MESSAGE,
  PREPARING_DOCUMENT_HINT,
  PREPARING_DOCUMENT_MESSAGE,
  TRY_AGAIN_LABEL,
} from './waiting-copy';
import { WaitingForDocument, type WaitingReadiness } from './waiting-for-document';

const CACHED_LIST: DocumentsList = { mine: [], shared: [summaryAs(DocumentRole.Reader)] };
const TITLE_SKELETON_TEST_ID = 'waiting-title-skeleton';

function renderWaiting({ readiness, cached = false }: { readiness: WaitingReadiness; cached?: boolean }) {
  const queryClient = new QueryClient();
  if (cached) queryClient.setQueryData(DOCUMENTS_QUERY_KEY, CACHED_LIST);
  const onKeepWaiting = vi.fn();
  const onRetry = vi.fn();
  renderWithProviders(
    <WaitingForDocument documentId={DOCUMENT_ID} readiness={readiness} onKeepWaiting={onKeepWaiting} onRetry={onRetry} />,
    {
      queryClient,
    },
  );
  return { onKeepWaiting, onRetry };
}

test('the waiting state shows Preparing the document… and Back to documents', () => {
  renderWaiting({ readiness: DocumentReadiness.Waiting });
  const status = screen.getByRole('status');
  expect(within(status).getByText(PREPARING_DOCUMENT_MESSAGE)).toBeInTheDocument();
  expect(within(status).getByText(PREPARING_DOCUMENT_HINT)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toHaveAttribute('href', AppRoute.Documents);
  expect(screen.queryByRole('button', { name: KEEP_WAITING_LABEL })).not.toBeInTheDocument();
});

test('the paused state shows the five-minute message and Keep waiting first', async () => {
  const { onKeepWaiting } = renderWaiting({ readiness: DocumentReadiness.Paused });
  const status = screen.getByRole('status');
  expect(within(status).getByText(NOT_READY_PAUSED_HEADING)).toBeInTheDocument();
  expect(within(status).getByText(NOT_READY_PAUSED_MESSAGE)).toBeInTheDocument();
  expect(NOT_READY_PAUSED_MESSAGE).toContain('5 minutes');
  const keepWaiting = screen.getByRole('button', { name: KEEP_WAITING_LABEL });
  const back = screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL });
  expect(keepWaiting.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.click(keepWaiting);
  expect(onKeepWaiting).toHaveBeenCalledTimes(1);
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

test('an unavailable document shows its own message and no retry', () => {
  renderWaiting({ readiness: DocumentReadiness.Unavailable });
  expect(within(screen.getByRole('alert')).getByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: TRY_AGAIN_LABEL })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toBeInTheDocument();
});

test('the title shows when the documents cache holds it, and a skeleton otherwise', () => {
  renderWaiting({ readiness: DocumentReadiness.Waiting, cached: true });
  expect(screen.getByText(DOCUMENT_TITLE)).toBeInTheDocument();
  expect(screen.queryByTestId(TITLE_SKELETON_TEST_ID)).not.toBeInTheDocument();
});

test('without a cached title a skeleton takes its place', () => {
  renderWaiting({ readiness: DocumentReadiness.Waiting });
  expect(screen.queryByText(DOCUMENT_TITLE)).not.toBeInTheDocument();
  expect(screen.getByTestId(TITLE_SKELETON_TEST_ID)).toBeInTheDocument();
});
