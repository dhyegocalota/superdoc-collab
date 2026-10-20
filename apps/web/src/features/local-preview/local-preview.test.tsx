import { BootstrapStage, DOCX_MIME_TYPE } from '@superdoc-collab/types';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DocumentMode } from '@/features/editor/superdoc-options';
import { OpenStage } from '@/features/open-progress/open-stage';
import { bootstrapAt, DOCUMENT_TITLE } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { LocalPreview } from './local-preview';
import { PREVIEW_BADGE_MESSAGE, PREVIEW_FAILED_MESSAGE, PREVIEW_OPENING_DETAIL } from './local-preview-copy';

type PreviewConfig = {
  selector: HTMLElement;
  documentMode: string;
  documents: { id: string; type: string; data: Blob; v2Collaboration?: unknown }[];
  onPaginationUpdate: (payload: { totalPages: number }) => void;
  onException: (payload: { error: Error; editor: null }) => void;
};

const { SuperDoc, superdocDestroy } = vi.hoisted(() => {
  const superdocDestroy = vi.fn();
  return {
    superdocDestroy,
    SuperDoc: vi.fn(function SuperDocStub(_config: PreviewConfig) {
      return { destroy: superdocDestroy };
    }),
  };
});

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));

const PANEL_TEST_ID = 'open-progress';
const PREVIEW_SURFACE_TEST_ID = 'local-preview';
const PAINTED_FRAGMENT_HTML = '<div class="superdoc-page"><div class="superdoc-fragment">First paragraph</div></div>';
const FILE = new File([new Uint8Array(1)], 'plan.docx', { type: DOCX_MIME_TYPE });

afterEach(() => {
  SuperDoc.mockClear();
  superdocDestroy.mockClear();
});

function renderPreview({ isProgressShown = true }: { isProgressShown?: boolean } = {}) {
  const now = Date.now();
  const view = renderWithProviders(
    <LocalPreview
      title={DOCUMENT_TITLE}
      file={FILE}
      bootstrap={bootstrapAt(BootstrapStage.Queued)}
      answeredAt={now}
      startedAt={now}
      isProgressShown={isProgressShown}
    />,
  );
  const config = SuperDoc.mock.calls.at(0)?.[0];
  if (!config) throw new Error('SuperDoc was not constructed');
  return { ...view, config };
}

test('opens the kept file read-only in the surface, with no room', () => {
  const { config } = renderPreview();
  expect(config.documentMode).toBe(DocumentMode.Viewing);
  expect(config.documents).toHaveLength(1);
  expect(config.documents[0]!.data).toBe(FILE);
  expect(config.documents[0]!.v2Collaboration).toBeUndefined();
  expect(config.selector).toBe(screen.getByTestId(PREVIEW_SURFACE_TEST_ID));
});

test('says it is a preview and names the document', () => {
  renderPreview();
  expect(screen.getByText(PREVIEW_BADGE_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(DOCUMENT_TITLE, { selector: 'span' })).toBeInTheDocument();
});

test('shows the Preparing panel with the preview detail once the delay has passed', () => {
  renderPreview();
  const panel = screen.getByTestId(PANEL_TEST_ID);
  expect(panel).toHaveAttribute('data-stage', OpenStage.Preparing);
  expect(screen.getByTestId('open-progress-detail')).toHaveTextContent(PREVIEW_OPENING_DETAIL);
});

test('shows no panel before the delay has passed', () => {
  renderPreview({ isProgressShown: false });
  expect(screen.queryByTestId(PANEL_TEST_ID)).not.toBeInTheDocument();
});

test('counts the pages the preview has laid out in the panel', () => {
  const { config } = renderPreview();
  act(() => config.onPaginationUpdate({ totalPages: 3 }));
  expect(screen.getByTestId('open-progress-detail')).toHaveTextContent('3 so far');
});

test('the panel leaves with the first painted paragraph and the badge stays', async () => {
  renderPreview();
  const surface = screen.getByTestId(PREVIEW_SURFACE_TEST_ID);
  await act(async () => {
    surface.innerHTML = PAINTED_FRAGMENT_HTML;
  });
  expect(screen.queryByTestId(PANEL_TEST_ID)).not.toBeInTheDocument();
  expect(screen.getByText(PREVIEW_BADGE_MESSAGE)).toBeInTheDocument();
});

test('a preview that cannot be opened says so and leaves the panel', () => {
  const { config } = renderPreview();
  act(() => config.onException({ error: new Error('boom'), editor: null }));
  expect(screen.getByText(PREVIEW_FAILED_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByTestId(PANEL_TEST_ID)).not.toBeInTheDocument();
});

test('leaving destroys the preview', () => {
  renderPreview();
  cleanup();
  expect(superdocDestroy).toHaveBeenCalledTimes(1);
});
