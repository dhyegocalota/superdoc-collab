import { ApiPath } from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
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

test('tabs show one client at a time', async () => {
  renderWithProviders(<UseWithAiContent title={null} canEdit={false} />);
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
    Object.values(McpClient).map((client) => MCP_CLIENT_LABELS[client]),
  );
  expect(screen.getByText(MCP_SNIPPETS[McpClient.ClaudeCode](MCP_URL))).toBeInTheDocument();
  expect(screen.queryByText(CHATGPT_INSTRUCTION)).not.toBeInTheDocument();
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
