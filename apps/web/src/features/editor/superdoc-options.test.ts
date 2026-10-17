import { COLLABORATION_TOKEN_PLACEHOLDER, DOCX_MIME_TYPE, RoomMode } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { EDITOR_USER, SESSION_USER } from '@/testing/opened-document';
import { HOCUSPOCUS_PROVIDER } from './collaboration-config';
import optionsSource from './superdoc-options.ts?raw';
import { DocumentMode, superdocOptions, TOOLBAR_EXCLUDED_ITEMS } from './superdoc-options';
import { SUPERDOC_TELEMETRY } from './superdoc-telemetry';
import { ZoomMode } from './superdoc-zoom';

const DOCUMENT_ID = 'doc-1';
const COLLABORATION_PATH = '/collaboration/doc-1';
const USER_COLOR = '#2e39b8';
const PALETTE_COLORS = ['#2e39b8', '#5a2eb8', '#912eb8', '#b82ea8', '#b82e70', '#b82e39'];

function optionsFor(toolbarContainer: HTMLElement | null) {
  return superdocOptions({
    container: document.createElement('div'),
    toolbarContainer,
    documentId: DOCUMENT_ID,
    file: new Blob(),
    documentMode: DocumentMode.Editing,
    collaborationPath: COLLABORATION_PATH,
    roomMode: RoomMode.Join,
    user: { ...SESSION_USER },
    userColor: USER_COLOR,
    paletteColors: PALETTE_COLORS,
  });
}

test('the options open the file in its room as the signed-in user, fitted to the width', () => {
  const container = document.createElement('div');
  const toolbarContainer = document.createElement('div');
  const file = new Blob();
  const options = superdocOptions({
    container,
    toolbarContainer,
    documentId: DOCUMENT_ID,
    file,
    documentMode: DocumentMode.Viewing,
    collaborationPath: COLLABORATION_PATH,
    roomMode: RoomMode.Join,
    user: { ...SESSION_USER },
    userColor: USER_COLOR,
    paletteColors: PALETTE_COLORS,
  });
  expect(options).toEqual({
    selector: container,
    documentMode: DocumentMode.Viewing,
    documents: [
      {
        id: DOCUMENT_ID,
        type: DOCX_MIME_TYPE,
        data: file,
        v2Collaboration: {
          providerType: HOCUSPOCUS_PROVIDER,
          documentId: DOCUMENT_ID,
          serverUrl: `ws://localhost:3000${COLLABORATION_PATH}`,
          roomMode: RoomMode.Join,
          token: COLLABORATION_TOKEN_PLACEHOLDER,
        },
      },
    ],
    user: { ...EDITOR_USER, color: USER_COLOR },
    colors: PALETTE_COLORS,
    telemetry: SUPERDOC_TELEMETRY,
    zoom: { mode: ZoomMode.FitWidth, fitWidth: { max: 100 } },
    ui: {
      comments: { layout: 'auto', responsive: { breakpoint: 480 } },
      toolbar: { container: toolbarContainer, responsiveTo: 'container', excludeItems: TOOLBAR_EXCLUDED_ITEMS },
      search: true,
    },
  });
});

test('ui.toolbar excludes accept, reject, ruler, measurement unit, document mode, search, linked-style, copy-format, clear-formatting and ai', () => {
  expect(TOOLBAR_EXCLUDED_ITEMS).toEqual([
    'track-changes-accept-selection',
    'track-changes-reject-selection',
    'ruler',
    'measurement-unit',
    'document-mode',
    'search',
    'linked-style',
    'copy-format',
    'clear-formatting',
    'ai',
  ]);
});

test('excludeItems is declared satisfies readonly ToolbarItemId[]', () => {
  expect(optionsSource).toContain('satisfies readonly ToolbarItemId[]');
});

test('ui.search is true so Cmd+F opens the Find bar', () => {
  expect(optionsFor(document.createElement('div')).ui).toMatchObject({ search: true });
});

test('user.color and colors come from the palette arguments', () => {
  const options = optionsFor(document.createElement('div'));
  expect(options.user?.color).toBe(USER_COLOR);
  expect(options.colors).toEqual(PALETTE_COLORS);
});

test('without a toolbar container there is no toolbar', () => {
  expect(optionsFor(null).ui).not.toHaveProperty('toolbar');
});
