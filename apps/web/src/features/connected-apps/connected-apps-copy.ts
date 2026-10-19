export enum McpClient {
  ClaudeCode = 'claude-code',
  Cursor = 'cursor',
  ChatGpt = 'chatgpt',
}

export const CONNECTED_APPS_HEADING = 'Connected apps';
export const CONNECTED_APPS_EMPTY_MESSAGE = 'No AI clients connected yet';
export const CONNECTED_APPS_LOAD_ERROR_MESSAGE = 'Connected apps could not be loaded.';
export const REVOKE_ERROR_MESSAGE = 'The app could not be revoked. Try again.';
export const LOADING_CONNECTED_APPS_LABEL = 'Loading connected apps';
export const UNNAMED_CLIENT_LABEL = 'Unnamed AI client';
export const CHATGPT_INSTRUCTION = 'In ChatGPT open Settings → Connectors → Add custom connector and paste the URL.';
export const CONNECT_HEADING = 'Connect an AI client';
export const COPY_LABEL = 'Copy';
export const COPIED_LABEL = 'Copied';
export const CONNECTED_ON_LABEL = 'Connected';
export const REVOKE_LABEL = 'Revoke';
export const USE_WITH_AI_LABEL = 'Use with AI';
export const USE_WITH_AI_TITLE = 'Use this document with your AI';
export const USE_WITH_AI_DESCRIPTION =
  'Connect your AI client once. It asks you to approve access the first time, then works on every document you can open.';
export const AI_CLIENTS_TABLIST_LABEL = 'AI clients';
export const EXAMPLE_PROMPTS_HEADING = 'Then try asking';
export const MANAGE_CONNECTED_APPS_LABEL = 'Manage connected apps';
export const CLOSE_LABEL = 'Close';
export const LIBRARY_PROMPTS: string[] = ['Summarize what changed in my documents today.', 'Which documents did Bruno edit this week?'];

export function copyLabel(subject: string): string {
  return `${COPY_LABEL} ${subject}`;
}

export function revokeLabel(clientName: string): string {
  return `${REVOKE_LABEL} ${clientName}`;
}

export const MCP_CLIENT_LABELS: Record<McpClient, string> = {
  [McpClient.ClaudeCode]: 'Claude Code',
  [McpClient.Cursor]: 'Cursor',
  [McpClient.ChatGpt]: 'ChatGPT',
};

export const MCP_SNIPPETS: Record<McpClient, (url: string) => string> = {
  [McpClient.ClaudeCode]: (url) => `claude mcp add --transport http history ${url}`,
  [McpClient.Cursor]: (url) => JSON.stringify({ mcpServers: { history: { url } } }, null, 2),
  [McpClient.ChatGpt]: (url) => url,
};

export function documentPrompts({ title, canEdit }: { title: string; canEdit: boolean }): string[] {
  const readPrompts = [`Summarize what changed in “${title}” today.`, `Who edited “${title}” the most, and what did they change?`];
  if (!canEdit) return readPrompts;
  return [...readPrompts, `Fix the typos in “${title}”.`];
}
