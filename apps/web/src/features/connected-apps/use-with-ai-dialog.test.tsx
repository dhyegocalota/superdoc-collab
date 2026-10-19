import { ApiPath, AppRoute } from '@superdoc-collab/types';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  CHATGPT_INSTRUCTION,
  CLOSE_LABEL,
  copyLabel,
  documentPrompts,
  EXAMPLE_PROMPTS_HEADING,
  MANAGE_CONNECTED_APPS_LABEL,
  MCP_CLIENT_LABELS,
  MCP_SNIPPETS,
  McpClient,
  USE_WITH_AI_DESCRIPTION,
  USE_WITH_AI_LABEL,
  USE_WITH_AI_TITLE,
} from './connected-apps-copy';
import { UseWithAiDialog } from './use-with-ai-dialog';

const TITLE = 'Quarterly plan';
const MCP_URL = `${window.location.origin}${ApiPath.Mcp}`;

async function openDialog(props: { title: string | null; canEdit: boolean }): Promise<HTMLElement> {
  renderWithProviders(<UseWithAiDialog {...props} />);
  await userEvent.click(screen.getByRole('button', { name: USE_WITH_AI_LABEL }));
  return screen.findByRole('dialog', { name: USE_WITH_AI_TITLE });
}

test('the dialog shows the title, the description and the footer actions', async () => {
  const dialog = await openDialog({ title: TITLE, canEdit: true });
  expect(within(dialog).getByText(USE_WITH_AI_DESCRIPTION)).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: MANAGE_CONNECTED_APPS_LABEL })).toHaveAttribute('href', AppRoute.ConnectedApps);
  expect(within(dialog).getAllByRole('button', { name: CLOSE_LABEL }).length).toBeGreaterThan(0);
});

test('tabs show one client at a time', async () => {
  const dialog = await openDialog({ title: TITLE, canEdit: true });
  const tabs = within(dialog).getAllByRole('tab');
  expect(tabs.map((tab) => tab.textContent)).toEqual(Object.values(McpClient).map((client) => MCP_CLIENT_LABELS[client]));
  expect(tabs[0]).toHaveFocus();
  expect(within(dialog).getByText(MCP_SNIPPETS[McpClient.ClaudeCode](MCP_URL))).toBeInTheDocument();
  expect(within(dialog).queryByText(CHATGPT_INSTRUCTION)).not.toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('tab', { name: MCP_CLIENT_LABELS[McpClient.ChatGpt] }));
  expect(within(dialog).getByText(CHATGPT_INSTRUCTION)).toBeInTheDocument();
  expect(within(dialog).queryByText(MCP_SNIPPETS[McpClient.ClaudeCode](MCP_URL))).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: copyLabel(MCP_CLIENT_LABELS[McpClient.ChatGpt]) })).toBeInTheDocument();
});

test('a reader sees two example prompts that name the document, an editor sees three', async () => {
  const readerDialog = await openDialog({ title: TITLE, canEdit: false });
  const readerPrompts = documentPrompts({ title: TITLE, canEdit: false });
  expect(within(readerDialog).getByText(EXAMPLE_PROMPTS_HEADING)).toBeInTheDocument();
  expect(
    within(readerDialog)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(readerPrompts);
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: USE_WITH_AI_LABEL }));
  expect(within(await screen.findByRole('dialog')).getAllByRole('listitem')).toHaveLength(2);
});

test('Escape closes the dialog and returns focus to the trigger', async () => {
  await openDialog({ title: TITLE, canEdit: true });
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: USE_WITH_AI_LABEL })).toHaveFocus();
});

test('a controlled dialog has no trigger, follows isOpen and returns focus to the given element', async () => {
  const returnFocusRef = createRef<HTMLButtonElement>();
  const onOpenChange = vi.fn();
  renderWithProviders(
    <>
      <button ref={returnFocusRef} type="button">
        Elsewhere
      </button>
      <UseWithAiDialog title={TITLE} canEdit isOpen onOpenChange={onOpenChange} returnFocusRef={returnFocusRef} />
    </>,
  );
  expect(screen.queryByRole('button', { name: USE_WITH_AI_LABEL })).not.toBeInTheDocument();
  expect(await screen.findByRole('dialog', { name: USE_WITH_AI_TITLE })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
