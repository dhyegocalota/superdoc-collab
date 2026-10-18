import { ApiPath } from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  AI_CLIENTS_TABLIST_LABEL,
  CHATGPT_INSTRUCTION,
  documentPrompts,
  EXAMPLE_PROMPTS_HEADING,
  LIBRARY_PROMPTS,
  MCP_CLIENT_LABELS,
  MCP_SNIPPETS,
  McpClient,
} from './connected-apps-copy';
import { UseWithAiContent } from './use-with-ai-content';

const TITLE = 'Plan';
const MCP_URL = `${window.location.origin}${ApiPath.Mcp}`;

function queryByPreformattedText(text: string): HTMLElement | null {
  return screen.queryByText((_, element) => element?.tagName === 'PRE' && element.textContent === text);
}

test('tabs show one client at a time', async () => {
  renderWithProviders(<UseWithAiContent title={null} canEdit={false} />);
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
    Object.values(McpClient).map((client) => MCP_CLIENT_LABELS[client]),
  );
  expect(screen.getByText(MCP_SNIPPETS[McpClient.ClaudeCode](MCP_URL))).toBeInTheDocument();
  expect(screen.queryByText(CHATGPT_INSTRUCTION)).not.toBeInTheDocument();
  expect(queryByPreformattedText(MCP_SNIPPETS[McpClient.Cursor](MCP_URL))).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: MCP_CLIENT_LABELS[McpClient.Cursor] }));
  expect(queryByPreformattedText(MCP_SNIPPETS[McpClient.Cursor](MCP_URL))).toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: MCP_CLIENT_LABELS[McpClient.ChatGpt] }));
  expect(screen.getByText(CHATGPT_INSTRUCTION)).toBeInTheDocument();
  expect(screen.queryByText(MCP_SNIPPETS[McpClient.ClaudeCode](MCP_URL))).not.toBeInTheDocument();
});

test('without a title the library prompts show', () => {
  renderWithProviders(<UseWithAiContent title={null} canEdit={false} />);
  expect(screen.getByText(EXAMPLE_PROMPTS_HEADING)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(LIBRARY_PROMPTS);
});

test('an editor sees three document prompts', () => {
  renderWithProviders(<UseWithAiContent title={TITLE} canEdit />);
  const prompts = documentPrompts({ title: TITLE, canEdit: true });
  expect(prompts).toHaveLength(3);
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(prompts);
});

test('the tab list has an accessible name', () => {
  renderWithProviders(<UseWithAiContent title={null} canEdit={false} />);
  expect(screen.getByRole('tablist', { name: AI_CLIENTS_TABLIST_LABEL })).toBeInTheDocument();
});
