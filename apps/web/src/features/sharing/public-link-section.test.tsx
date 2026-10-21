import { documentApiPath, DocumentResource, HttpMethod, HttpStatus, LINK_COPIED_MESSAGE, publicPagePath } from '@superdoc-collab/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  PUBLIC_LINK_ADDRESS_LABEL,
  PUBLIC_LINK_COPY_LABEL,
  PUBLIC_LINK_LOAD_FAILED_MESSAGE,
  PUBLIC_LINK_PRESENCE_NOTICE,
  PUBLIC_LINK_SWITCH_FAILED_MESSAGE,
  PUBLIC_LINK_SWITCH_LABEL,
} from './public-copy';
import { PublicLinkSection } from './public-link-section';

const PUBLIC_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Public });
const PUBLIC_URL = `${window.location.origin}${publicPagePath(DOCUMENT_ID)}`;

afterEach(() => vi.restoreAllMocks());

function mockPublicApi({ isPublic, switchStatus = HttpStatus.Ok }: { isPublic: boolean; switchStatus?: HttpStatus }) {
  const state = { isPublic };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input !== PUBLIC_PATH) return new Response(null, { status: HttpStatus.NotFound });
    if (init?.method !== HttpMethod.Put) return jsonResponse({ body: { isPublic: state.isPublic } });
    if (switchStatus !== HttpStatus.Ok) return new Response(null, { status: switchStatus });
    state.isPublic = JSON.parse(init.body as string).isPublic;
    return jsonResponse({ body: { isPublic: state.isPublic } });
  });
}

test('a private document shows the switch off and no link', async () => {
  mockPublicApi({ isPublic: false });
  renderWithProviders(<PublicLinkSection documentId={DOCUMENT_ID} />);
  const switchControl = await screen.findByRole('switch', { name: PUBLIC_LINK_SWITCH_LABEL });
  expect(switchControl).toHaveAttribute('aria-checked', 'false');
  expect(screen.queryByDisplayValue(PUBLIC_URL)).not.toBeInTheDocument();
  expect(screen.queryByText(PUBLIC_LINK_PRESENCE_NOTICE)).not.toBeInTheDocument();
});

test('a public document shows the switch on, the link and who can see the editors', async () => {
  mockPublicApi({ isPublic: true });
  renderWithProviders(<PublicLinkSection documentId={DOCUMENT_ID} />);
  expect(await screen.findByRole('switch', { name: PUBLIC_LINK_SWITCH_LABEL })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByLabelText(PUBLIC_LINK_ADDRESS_LABEL)).toHaveValue(PUBLIC_URL);
  expect(screen.getByText(PUBLIC_LINK_PRESENCE_NOTICE)).toBeInTheDocument();
});

test('switching on puts the flag, then shows the link', async () => {
  const fetchSpy = mockPublicApi({ isPublic: false });
  renderWithProviders(<PublicLinkSection documentId={DOCUMENT_ID} />);
  await userEvent.click(await screen.findByRole('switch', { name: PUBLIC_LINK_SWITCH_LABEL }));
  expect(await screen.findByLabelText(PUBLIC_LINK_ADDRESS_LABEL)).toHaveValue(PUBLIC_URL);
  expect(screen.getByRole('switch', { name: PUBLIC_LINK_SWITCH_LABEL })).toHaveAttribute('aria-checked', 'true');
  expect(fetchSpy).toHaveBeenCalledWith(
    PUBLIC_PATH,
    expect.objectContaining({ method: HttpMethod.Put, body: JSON.stringify({ isPublic: true }) }),
  );
});

test('switching off puts the flag and hides the link', async () => {
  const fetchSpy = mockPublicApi({ isPublic: true });
  renderWithProviders(<PublicLinkSection documentId={DOCUMENT_ID} />);
  await userEvent.click(await screen.findByRole('switch', { name: PUBLIC_LINK_SWITCH_LABEL }));
  await waitFor(() => expect(screen.queryByLabelText(PUBLIC_LINK_ADDRESS_LABEL)).not.toBeInTheDocument());
  expect(fetchSpy).toHaveBeenCalledWith(
    PUBLIC_PATH,
    expect.objectContaining({ method: HttpMethod.Put, body: JSON.stringify({ isPublic: false }) }),
  );
});

test('a refused switch says so and leaves the switch where it was', async () => {
  mockPublicApi({ isPublic: false, switchStatus: HttpStatus.Forbidden });
  renderWithProviders(<PublicLinkSection documentId={DOCUMENT_ID} />);
  await userEvent.click(await screen.findByRole('switch', { name: PUBLIC_LINK_SWITCH_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(PUBLIC_LINK_SWITCH_FAILED_MESSAGE);
  expect(screen.getByRole('switch', { name: PUBLIC_LINK_SWITCH_LABEL })).toHaveAttribute('aria-checked', 'false');
});

test('a setting that cannot be loaded says so and offers no switch', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.InternalServerError }));
  renderWithProviders(<PublicLinkSection documentId={DOCUMENT_ID} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(PUBLIC_LINK_LOAD_FAILED_MESSAGE);
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
});

test('Copy writes the public address to the clipboard and confirms', async () => {
  mockPublicApi({ isPublic: true });
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  renderWithProviders(<PublicLinkSection documentId={DOCUMENT_ID} />);
  await user.click(await screen.findByRole('button', { name: PUBLIC_LINK_COPY_LABEL }));
  expect(writeText).toHaveBeenCalledWith(PUBLIC_URL);
  expect(await screen.findByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
});
