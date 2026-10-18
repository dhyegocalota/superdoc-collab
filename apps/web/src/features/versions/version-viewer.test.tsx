import { waitFor } from '@testing-library/react';
import type { SuperDocExceptionPayload } from 'superdoc';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SuperDocExceptionCode } from '@/features/editor/superdoc-exceptions';
import { DOCUMENT_ID, SESSION_USER } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { VersionViewer } from './version-viewer';
import { AUTHOR_PALETTE, installAuthorPalette, removeAuthorPalette } from '@/testing/author-palette';

type SuperDocConfig = {
  user: { color: string };
  onException: (payload: SuperDocExceptionPayload) => void;
};

const { SuperDoc } = vi.hoisted(() => ({
  SuperDoc: vi.fn(function SuperDocStub(_config: SuperDocConfig) {
    return { destroy: vi.fn() };
  }),
}));

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));
vi.mock('@/features/editor/editor-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/editor/editor-api')>()),
  fetchDocumentFile: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])])),
}));

const SEQUENCE = 42;
const DISPLACED_COLOR_SLOT = 2;
const WARN_DIAGNOSTIC = {
  diagnosticCode: 'RENDER_ERROR',
  severity: 'warn',
  internalCode: 'internal-code',
  message: 'render failed',
  error: new Error('render failed'),
  diagnosticStage: 'render',
} as SuperDocExceptionPayload;
const COLLABORATION_REFUSAL = {
  code: 'collaboration-access-denied',
  collaborationReason: 'access-denied',
  error: new Error('denied'),
  editor: null,
} as SuperDocExceptionPayload;
const FATAL_PAYLOAD = { code: 'password-required', error: new Error('boom'), editor: null } as SuperDocExceptionPayload;
const EDIT_REJECTED = { code: SuperDocExceptionCode.EditRejected, error: new Error('rejected'), editor: null } as SuperDocExceptionPayload;

const onReady = vi.fn().mockName('onReady');
const onFailed = vi.fn().mockName('onFailed');
const onConnectionFailed = vi.fn().mockName('onConnectionFailed');

beforeEach(() => {
  installAuthorPalette();
  SuperDoc.mockClear();
  onReady.mockClear();
  onFailed.mockClear();
  onConnectionFailed.mockClear();
});
afterEach(() => {
  removeAuthorPalette();
  vi.restoreAllMocks();
});

async function raise(payload: SuperDocExceptionPayload): Promise<void> {
  renderWithProviders(
    <VersionViewer
      documentId={DOCUMENT_ID}
      sequence={SEQUENCE}
      user={SESSION_USER}
      colorSlot={DISPLACED_COLOR_SLOT}
      onReady={onReady}
      onFailed={onFailed}
      onConnectionFailed={onConnectionFailed}
    />,
  );
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  SuperDoc.mock.calls[0]![0].onException(payload);
}

test('the viewer user carries the colour of the slot the server assigned, not the id hash', async () => {
  await raise(WARN_DIAGNOSTIC);
  expect(SuperDoc.mock.calls[0]![0].user.color).toBe(AUTHOR_PALETTE[DISPLACED_COLOR_SLOT - 1]);
});

test('a warn diagnostic calls neither onFailed nor onConnectionFailed', async () => {
  await raise(WARN_DIAGNOSTIC);
  expect(onFailed).toHaveBeenCalledTimes(0);
  expect(onConnectionFailed).toHaveBeenCalledTimes(0);
});

test('a collaboration reason calls onConnectionFailed and not onFailed', async () => {
  await raise(COLLABORATION_REFUSAL);
  expect(onConnectionFailed).toHaveBeenCalledTimes(1);
  expect(onFailed).toHaveBeenCalledTimes(0);
});

test('a fatal payload calls onFailed', async () => {
  await raise(FATAL_PAYLOAD);
  expect(onFailed).toHaveBeenCalledTimes(1);
});

test('edit-rejected calls neither', async () => {
  await raise(EDIT_REJECTED);
  expect(onFailed).toHaveBeenCalledTimes(0);
  expect(onConnectionFailed).toHaveBeenCalledTimes(0);
});
