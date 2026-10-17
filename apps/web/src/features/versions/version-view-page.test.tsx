import { ApiPath, versionCollaborationPath, versionViewPagePath, RoomMode, type EditRunView } from '@superdoc-history/types';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BLANK_DOCX_PATH } from '@/features/editor/editor-api';
import { DocumentMode } from '@/features/editor/superdoc-editor';
import { ViewerMessageKind } from '@/features/editor/viewer-messages';
import { DOCUMENT_ID, SESSION_USER } from '@/test/opened-document';
import { renderWithProviders } from '@/test/render-with-providers';
import { VERSION_FAILED_MESSAGE } from '@/features/timeline/timeline-copy';
import { useRunHighlights } from './use-run-highlights';
import { VersionViewPage } from './version-view-page';

type SuperDocConfig = {
  documentMode: string;
  documents: { v2Collaboration: Record<string, unknown> }[];
  onCollaborationReady: () => void;
  onException: (payload: { error: Error }) => void;
  onCollaborationConnectionChange: (payload: { state: string; kind: string }) => void;
};

const { SuperDoc } = vi.hoisted(() => ({ SuperDoc: vi.fn(function SuperDocStub(_config: SuperDocConfig) { return { destroy: vi.fn() }; }) }));

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));
vi.mock('./use-run-highlights', () => ({ useRunHighlights: vi.fn() }));

const SEQUENCE = 42;
const ROUTE = versionViewPagePath({ documentId: DOCUMENT_ID, sequence: SEQUENCE });
const EVIL_ORIGIN = 'http://evil.example';
const RUNS: EditRunView[] = [{ blockId: 'block-1', bandId: 'band-0', authorKeys: ['ana'], inserted: 'hello', deleted: '', lastServerTime: 1 }];

beforeEach(() => {
  SuperDoc.mockClear();
  vi.mocked(useRunHighlights).mockClear();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return new Response(JSON.stringify({ user: SESSION_USER }));
    if (input === BLANK_DOCX_PATH) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error(`unexpected request ${String(input)}`);
  });
});
afterEach(() => vi.restoreAllMocks());

async function renderFrame(): Promise<SuperDocConfig> {
  renderWithProviders(<VersionViewPage />, { route: ROUTE });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  return SuperDoc.mock.calls[0]![0];
}

function messageFrom({ data, origin = window.location.origin }: { data: unknown; origin?: string }): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: window.parent }));
  });
}

test('the frame page opens a read-only SuperDoc on the version endpoint and reports readiness to its parent', async () => {
  const postToParent = vi.spyOn(window.parent, 'postMessage');
  const config = await renderFrame();
  expect(config.documentMode).toBe(DocumentMode.Viewing);
  expect(config.documents[0]!.v2Collaboration).toMatchObject({
    documentId: DOCUMENT_ID,
    roomMode: RoomMode.Join,
    serverUrl: `ws://localhost:3000${versionCollaborationPath({ documentId: DOCUMENT_ID, sequence: SEQUENCE })}`,
  });
  config.onCollaborationReady();
  expect(postToParent).toHaveBeenCalledWith({ kind: ViewerMessageKind.Ready }, window.location.origin);
});

test('an exception is reported to the parent as a failure', async () => {
  const postToParent = vi.spyOn(window.parent, 'postMessage');
  const config = await renderFrame();
  config.onException({ error: new Error('boom') });
  expect(postToParent).toHaveBeenCalledWith({ kind: ViewerMessageKind.Failed }, window.location.origin);
});

test('highlights from the parent reach the highlighter and Clear empties them', async () => {
  await renderFrame();
  messageFrom({ data: { kind: ViewerMessageKind.Highlight, runs: RUNS } });
  expect(vi.mocked(useRunHighlights)).toHaveBeenLastCalledWith(expect.objectContaining({ runs: RUNS }));
  messageFrom({ data: { kind: ViewerMessageKind.Clear } });
  expect(vi.mocked(useRunHighlights)).toHaveBeenLastCalledWith(expect.objectContaining({ runs: [] }));
});

test('a highlight from another origin is ignored', async () => {
  await renderFrame();
  messageFrom({ data: { kind: ViewerMessageKind.Highlight, runs: RUNS }, origin: EVIL_ORIGIN });
  expect(vi.mocked(useRunHighlights)).not.toHaveBeenCalledWith(expect.objectContaining({ runs: RUNS }));
});

test('a sequence that is not a number reports a failure and never opens a viewer', async () => {
  const postToParent = vi.spyOn(window.parent, 'postMessage');
  renderWithProviders(<VersionViewPage />, { route: versionViewPagePath({ documentId: DOCUMENT_ID, sequence: Number.NaN }) });
  await waitFor(() => expect(postToParent).toHaveBeenCalledWith({ kind: ViewerMessageKind.Failed }, window.location.origin));
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('a refused connection before the room is ready shows the failure and tells the parent', async () => {
  const postToParent = vi.spyOn(window.parent, 'postMessage');
  const config = await renderFrame();
  act(() => config.onCollaborationConnectionChange({ state: 'failed', kind: 'failed' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(VERSION_FAILED_MESSAGE);
  expect(postToParent).toHaveBeenCalledWith({ kind: ViewerMessageKind.Failed }, window.location.origin);
});

test('a connection that degrades before the first sync counts as refused', async () => {
  const config = await renderFrame();
  act(() => config.onCollaborationConnectionChange({ state: 'degraded', kind: 'reconnecting' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(VERSION_FAILED_MESSAGE);
});

test('a connection that drops after the room was ready keeps the viewer', async () => {
  const config = await renderFrame();
  act(() => config.onCollaborationReady());
  act(() => config.onCollaborationConnectionChange({ state: 'degraded', kind: 'lost' }));
  expect(screen.queryByRole('alert')).toBeNull();
});
