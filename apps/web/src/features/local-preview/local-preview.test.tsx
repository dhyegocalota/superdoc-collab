import { BootstrapStage, DOCX_MIME_TYPE } from '@superdoc-collab/types';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { DocumentMode } from '@/features/editor/superdoc-options';
import type { OpenProgressView } from '@/features/open-progress/open-progress-panel';
import { MAXIMIZE_PROGRESS_LABEL, MINIMIZE_PROGRESS_LABEL } from '@/features/open-progress/open-progress-copy';
import { OpenStage } from '@/features/open-progress/open-stage';
import { bootstrapAt, DOCUMENT_TITLE } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { LocalPreview } from './local-preview';
import { PREVIEW_FAILED_MESSAGE, PREVIEW_OPENING_DETAIL } from './local-preview-copy';

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
const LIVE_EDITOR_VIEW: OpenProgressView = { stage: OpenStage.Downloading, detail: 'Receiving 36.5 MB · 12 s', fraction: null };
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
      isSwapping={false}
      isFrozen={false}
      swappingViewAt={() => LIVE_EDITOR_VIEW}
      onScrollFraction={vi.fn()}
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

test('names the document and carries no status line besides the panel', () => {
  renderPreview();
  expect(screen.getByText(DOCUMENT_TITLE, { selector: 'span' })).toBeInTheDocument();
  expect(screen.getAllByRole('status')).toHaveLength(1);
});

test('the panel is a translucent card over the pages', () => {
  renderPreview();
  expect(screen.getByTestId(PANEL_TEST_ID)).toHaveClass('bg-card/80');
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

test('the panel stays over the pages the preview has painted', async () => {
  renderPreview();
  const surface = screen.getByTestId(PREVIEW_SURFACE_TEST_ID);
  await act(async () => {
    surface.innerHTML = PAINTED_FRAGMENT_HTML;
  });
  expect(screen.getByTestId(PANEL_TEST_ID)).toBeInTheDocument();
});

test('while the live editor opens beneath, the panel reads the live editor progress', () => {
  function Swapping() {
    const now = Date.now();
    return (
      <LocalPreview
        title={DOCUMENT_TITLE}
        file={FILE}
        bootstrap={bootstrapAt(BootstrapStage.Ready)}
        answeredAt={now}
        startedAt={now}
        isProgressShown
        isSwapping
        isFrozen
        swappingViewAt={() => LIVE_EDITOR_VIEW}
        onScrollFraction={vi.fn()}
      />
    );
  }
  renderWithProviders(<Swapping />);
  expect(screen.getByTestId(PANEL_TEST_ID)).toHaveAttribute('data-stage', OpenStage.Downloading);
  expect(screen.getByTestId('open-progress-detail')).toHaveTextContent(LIVE_EDITOR_VIEW.detail);
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

test('when the live editor starts the preview engine is destroyed and its painted pages stay frozen on screen, once', async () => {
  let startSwap: () => void = () => undefined;
  function Swapping() {
    const [isSwapping, setIsSwapping] = useState(false);
    startSwap = () => setIsSwapping(true);
    const now = Date.now();
    return (
      <LocalPreview
        title={DOCUMENT_TITLE}
        file={FILE}
        bootstrap={bootstrapAt(BootstrapStage.Queued)}
        answeredAt={now}
        startedAt={now}
        isProgressShown
        isSwapping
        isFrozen={isSwapping}
        swappingViewAt={() => LIVE_EDITOR_VIEW}
        onScrollFraction={vi.fn()}
      />
    );
  }
  renderWithProviders(<Swapping />);
  const surface = screen.getByTestId(PREVIEW_SURFACE_TEST_ID);
  await act(async () => {
    surface.innerHTML = PAINTED_FRAGMENT_HTML;
  });
  expect(superdocDestroy).not.toHaveBeenCalled();
  act(() => startSwap());
  expect(superdocDestroy).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId(PREVIEW_SURFACE_TEST_ID)).toBe(surface);
  expect(surface).toHaveTextContent('First paragraph');
  cleanup();
  expect(superdocDestroy).toHaveBeenCalledTimes(1);
});

test('the panel offers no minimize control until the preview has pages', () => {
  const { config } = renderPreview();
  expect(screen.queryByRole('button', { name: MINIMIZE_PROGRESS_LABEL })).not.toBeInTheDocument();
  act(() => config.onPaginationUpdate({ totalPages: 1 }));
  expect(screen.getByRole('button', { name: MINIMIZE_PROGRESS_LABEL })).toBeInTheDocument();
});

test('the panel minimizes to the bar over the pages and maximizes back', () => {
  const { config } = renderPreview();
  act(() => config.onPaginationUpdate({ totalPages: 2 }));
  expect(screen.getByTestId(PANEL_TEST_ID)).not.toHaveAttribute('data-minimized');
  fireEvent.click(screen.getByRole('button', { name: MINIMIZE_PROGRESS_LABEL }));
  expect(screen.getByTestId(PANEL_TEST_ID)).toHaveAttribute('data-minimized', 'true');
  fireEvent.click(screen.getByRole('button', { name: MAXIMIZE_PROGRESS_LABEL }));
  expect(screen.getByTestId(PANEL_TEST_ID)).not.toHaveAttribute('data-minimized');
});

test('an overlay over the converting editor keeps its engine alive until it is frozen', async () => {
  let freeze: () => void = () => undefined;
  function Overlay() {
    const [isFrozen, setIsFrozen] = useState(false);
    freeze = () => setIsFrozen(true);
    const now = Date.now();
    return (
      <LocalPreview
        title={DOCUMENT_TITLE}
        file={FILE}
        bootstrap={null}
        answeredAt={now}
        startedAt={now}
        isProgressShown
        isSwapping
        isFrozen={isFrozen}
        swappingViewAt={() => LIVE_EDITOR_VIEW}
        onScrollFraction={vi.fn()}
      />
    );
  }
  renderWithProviders(<Overlay />);
  expect(superdocDestroy).not.toHaveBeenCalled();
  expect(SuperDoc).toHaveBeenCalledTimes(1);
  act(() => freeze());
  expect(superdocDestroy).toHaveBeenCalledTimes(1);
});
