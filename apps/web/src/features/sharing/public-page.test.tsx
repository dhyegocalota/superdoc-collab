import {
  ApiPath,
  ClientActor,
  COLLABORATION_TOKEN_PLACEHOLDER,
  documentPagePath,
  HttpStatus,
  PREPARING_POLL_MS,
  PUBLIC_PREPARING_MESSAGE,
  PUBLIC_RATE_LIMITED_MESSAGE,
  PublicAccess,
  PublicAnimal,
  publicApiPath,
  publicPagePath,
  publicSummaryApiPath,
  READ_ONLY_BADGE_LABEL,
  anonymousViewerOf,
  type PublicOpened,
  type PublicSummary,
} from '@superdoc-collab/types';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SELECTION_SUMMARY_HEADING, SUMMARIZE_EDITS_LABEL } from '@/features/timeline/timeline-copy';
import { installAuthorPalette, removeAuthorPalette } from '@/testing/author-palette';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID, DOCUMENT_TITLE } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { BLANK_DOCX_PATH } from '@/features/editor/editor-api';
import { SHARE_LABEL } from '@/features/editor/editor-copy';
import {
  PUBLIC_CONNECTION_FAILED_MESSAGE,
  PUBLIC_RELOAD_LABEL,
  PUBLIC_RETRY_LABEL,
  PUBLIC_UNAVAILABLE_MESSAGE,
  PUBLIC_VIEW_ONLY_LABEL,
  publicViewerLabel,
} from './public-copy';
import { PublicPage } from './public-page';

type SuperDocConfig = {
  documentMode: string;
  user: { id: string; name: string; email: string };
  documents: { v2Collaboration: { serverUrl: string; token: string; roomMode: string } }[];
  ui: { toolbar?: unknown };
  onException: (payload: { code: string; collaborationReason: string; error: Error; editor: null }) => void;
  onCollaborationReady: () => void;
  onReady?: (payload: { superdoc: unknown }) => void;
};

const { SuperDoc, superDocDestroy } = vi.hoisted(() => {
  const superDocDestroy = vi.fn();
  return {
    superDocDestroy,
    SuperDoc: vi.fn(function SuperDocStub(config: SuperDocConfig) {
      const instance = { destroy: superDocDestroy, on: vi.fn(), off: vi.fn() };
      config.onReady?.({ superdoc: instance });
      return instance;
    }),
  };
});

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));

const VIEWER = anonymousViewerOf('visitor-1');
const ROOM_TOKEN = 'a-room-token';
const VISITOR: PublicOpened = {
  access: PublicAccess.Visitor,
  document: { id: DOCUMENT_ID, title: DOCUMENT_TITLE },
  viewer: VIEWER,
  roomToken: ROOM_TOKEN,
};
const SUMMARY_SENTENCE = 'Ana raised the budget.';
const SUMMARY: PublicSummary = {
  summary: {
    sentence: SUMMARY_SENTENCE,
    authors: [{ name: 'Ana', actor: ClientActor.Human }],
    computedAtSequence: 4,
    updatedAt: 1_800_000_000_000,
  },
};
const NO_SUMMARY: PublicSummary = { summary: null };
const CONNECTION_FAILED = {
  code: 'collaboration-connection-failed',
  collaborationReason: 'connection-failed',
  error: new Error('refused'),
  editor: null,
};
const ACCESS_DENIED = {
  code: 'collaboration-access-denied',
  collaborationReason: 'access-denied',
  error: new Error('denied'),
  editor: null,
};

beforeEach(() => {
  installAuthorPalette();
  SuperDoc.mockClear();
  superDocDestroy.mockClear();
});

afterEach(() => {
  removeAuthorPalette();
  vi.restoreAllMocks();
});

function constructedConfig(): SuperDocConfig {
  const config = SuperDoc.mock.calls.at(-1)?.[0];
  if (!config) throw new Error('SuperDoc was not constructed.');
  return config;
}

function mockPublicApi({
  opened = () => jsonResponse({ body: VISITOR }),
  summary = NO_SUMMARY,
}: { opened?: () => Response; summary?: PublicSummary } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === publicApiPath(DOCUMENT_ID)) return opened();
    if (input === publicSummaryApiPath(DOCUMENT_ID)) return jsonResponse({ body: summary });
    if (input === BLANK_DOCX_PATH) return new Response(new Blob());
    return new Response(null, { status: HttpStatus.NotFound });
  });
}

function renderPublicPage() {
  return renderWithProviders(<PublicPage />, { route: publicPagePath(DOCUMENT_ID) });
}

test('a visitor reads the document in view-only mode with no editing tools', async () => {
  mockPublicApi();
  renderPublicPage();
  expect(await screen.findByText(DOCUMENT_TITLE)).toBeInTheDocument();
  expect(screen.getByText(PUBLIC_VIEW_ONLY_LABEL)).toBeInTheDocument();
  expect(screen.getByText(publicViewerLabel(VIEWER.name))).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: SHARE_LABEL })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: SUMMARIZE_EDITS_LABEL })).not.toBeInTheDocument();
  expect(screen.queryByText(READ_ONLY_BADGE_LABEL)).not.toBeInTheDocument();
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const config = constructedConfig();
  expect(config.documentMode).toBe('viewing');
  expect(config.ui.toolbar).toBeUndefined();
});

test('the editor joins the public socket with the room token and the anonymous identity', async () => {
  mockPublicApi();
  renderPublicPage();
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const { v2Collaboration } = constructedConfig().documents[0]!;
  expect(v2Collaboration.serverUrl).toContain(ApiPath.PublicCollaboration);
  expect(v2Collaboration.token).toBe(ROOM_TOKEN);
  expect(v2Collaboration.token).not.toBe(COLLABORATION_TOKEN_PLACEHOLDER);
  expect(v2Collaboration.roomMode).toBe('join');
  expect(constructedConfig().user).toMatchObject({ id: VIEWER.id, name: VIEWER.name });
  expect(Object.values(PublicAnimal)).toContain(VIEWER.animal);
});

test('the latest stored summary shows in the summary card with no way to ask for another', async () => {
  mockPublicApi({ summary: SUMMARY });
  renderPublicPage();
  expect(await screen.findByText(SUMMARY_SENTENCE)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: SELECTION_SUMMARY_HEADING })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: SUMMARIZE_EDITS_LABEL })).not.toBeInTheDocument();
});

test('a document with no stored summary shows no summary card', async () => {
  mockPublicApi({ summary: NO_SUMMARY });
  renderPublicPage();
  await screen.findByText(DOCUMENT_TITLE);
  expect(screen.queryByRole('heading', { name: SELECTION_SUMMARY_HEADING })).not.toBeInTheDocument();
});

test('a member is redirected to the document', async () => {
  mockPublicApi({ opened: () => jsonResponse({ body: { access: PublicAccess.Member } satisfies PublicOpened }) });
  const { router } = renderPublicPage();
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(DOCUMENT_ID)));
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('a document that is not found says it is not available and opens no editor', async () => {
  mockPublicApi({ opened: () => jsonResponse({ body: { error: 'Not found' }, status: HttpStatus.NotFound }) });
  renderPublicPage();
  expect(await screen.findByText(PUBLIC_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('a spent window shows the server sentence and a button that asks again', async () => {
  const answers = [
    () =>
      jsonResponse({ body: { error: PUBLIC_RATE_LIMITED_MESSAGE }, status: HttpStatus.TooManyRequests, headers: { 'Retry-After': '5' } }),
    () => jsonResponse({ body: VISITOR }),
  ];
  mockPublicApi({ opened: () => answers.shift()!() });
  renderPublicPage();
  expect(await screen.findByText(PUBLIC_RATE_LIMITED_MESSAGE)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: PUBLIC_RETRY_LABEL }));
  expect(await screen.findByText(DOCUMENT_TITLE)).toBeInTheDocument();
});

test('a room that is still being prepared says so and opens by itself once ready', async () => {
  const answers = [
    () =>
      jsonResponse({ body: { error: PUBLIC_PREPARING_MESSAGE }, status: HttpStatus.ServiceUnavailable, headers: { 'Retry-After': '1' } }),
    () => jsonResponse({ body: VISITOR }),
  ];
  mockPublicApi({ opened: () => answers.shift()!() });
  renderPublicPage();
  expect(await screen.findByText(PUBLIC_PREPARING_MESSAGE)).toBeInTheDocument();
  expect(await screen.findByText(DOCUMENT_TITLE, undefined, { timeout: 2 * PREPARING_POLL_MS + 2000 })).toBeInTheDocument();
});

test('an access denial from the socket asks again and lands on not available when the owner switched it off', async () => {
  const answers = [
    () => jsonResponse({ body: VISITOR }),
    () => jsonResponse({ body: { error: 'Not found' }, status: HttpStatus.NotFound }),
  ];
  mockPublicApi({ opened: () => answers.shift()!() });
  renderPublicPage();
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationReady());
  act(() => constructedConfig().onException(ACCESS_DENIED));
  expect(await screen.findByText(PUBLIC_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
});

test('a connection that fails after it synced asks for a new room token by itself', async () => {
  const freshViewer = anonymousViewerOf('visitor-2');
  const answers = [
    () => jsonResponse({ body: VISITOR }),
    () => jsonResponse({ body: { ...VISITOR, viewer: freshViewer, roomToken: 'second-token' } }),
  ];
  mockPublicApi({ opened: () => answers.shift()!() });
  renderPublicPage();
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationReady());
  act(() => constructedConfig().onException(CONNECTION_FAILED));
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2));
  expect(constructedConfig().documents[0]!.v2Collaboration.token).toBe('second-token');
  expect(superDocDestroy).toHaveBeenCalled();
});

test('a connection that fails before it synced shows a banner whose Reload asks for a new room token', async () => {
  const freshViewer = anonymousViewerOf('visitor-2');
  const answers = [
    () => jsonResponse({ body: VISITOR }),
    () => jsonResponse({ body: { ...VISITOR, viewer: freshViewer, roomToken: 'second-token' } }),
  ];
  mockPublicApi({ opened: () => answers.shift()!() });
  renderPublicPage();
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onException(CONNECTION_FAILED));
  expect(await screen.findByText(PUBLIC_CONNECTION_FAILED_MESSAGE)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: PUBLIC_RELOAD_LABEL }));
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2));
  expect(constructedConfig().documents[0]!.v2Collaboration.token).toBe('second-token');
});
