import {
  AppRoute,
  documentPagePath,
  HttpMethod,
  HttpStatus,
  INVALID_SHARE_LINK_MESSAGE,
  shareLinkAcceptPath,
} from '@superdoc-collab/types';
import { screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { APP_NAME } from '@/lib/app-copy';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import { BACK_TO_DOCUMENTS_LABEL, SHARE_OPENING_MESSAGE } from '@/features/editor/editor-copy';
import { ShareLandingPage } from './share-landing-page';

const TOKEN = 'token-1';
const SHARED_DOCUMENT_ID = 'doc-9';
const SHARE_ROUTE = `/share/${TOKEN}`;

afterEach(() => vi.restoreAllMocks());

test('a 200 accept opens the document replacing the share entry', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: { documentId: SHARED_DOCUMENT_ID } }));
  const { router } = renderWithProviders(<ShareLandingPage />, { route: SHARE_ROUTE });
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(SHARED_DOCUMENT_ID)));
  expect(router.state.historyAction).toBe('REPLACE');
});

test('a 404 shows the invalid link message and a way back', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    jsonResponse({ body: { error: INVALID_SHARE_LINK_MESSAGE }, status: HttpStatus.NotFound }),
  );
  renderWithProviders(<ShareLandingPage />, { route: SHARE_ROUTE });
  expect(await screen.findByText(INVALID_SHARE_LINK_MESSAGE)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toHaveAttribute('href', AppRoute.Documents);
});

test('the accept is posted once under StrictMode', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: { documentId: SHARED_DOCUMENT_ID } }));
  const { router } = renderWithProviders(
    <StrictMode>
      <ShareLandingPage />
    </StrictMode>,
    { route: SHARE_ROUTE },
  );
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(SHARED_DOCUMENT_ID)));
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(fetchSpy).toHaveBeenCalledWith(shareLinkAcceptPath(TOKEN), expect.objectContaining({ method: HttpMethod.Post }));
});

test('while the accept is in flight the page says it is opening', () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => undefined));
  renderWithProviders(<ShareLandingPage />, { route: SHARE_ROUTE });
  expect(screen.getByText(SHARE_OPENING_MESSAGE)).toBeInTheDocument();
});

test('the opening state is centred like the failure state', () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => undefined));
  renderWithProviders(<ShareLandingPage />, { route: SHARE_ROUTE });
  const opening = screen.getByRole('status');
  expect(opening).toHaveTextContent(SHARE_OPENING_MESSAGE);
  expect(screen.getByRole('main')).toContainElement(opening);
});

test('the share landing names its tab after the app', async () => {
  document.title = SHARE_ROUTE;
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => undefined));
  renderWithProviders(<ShareLandingPage />, { route: SHARE_ROUTE });
  await waitFor(() => expect(document.title).toBe(APP_NAME));
});
