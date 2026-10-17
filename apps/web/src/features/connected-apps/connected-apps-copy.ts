export enum McpClient {
  ClaudeCode = 'claude-code',
  Cursor = 'cursor',
  ChatGpt = 'chatgpt',
}

export const CONNECTED_APPS_HEADING = 'Connected apps';
export const BACK_TO_DOCUMENTS_LABEL = 'Documents';
export const CONNECTED_APPS_EMPTY_MESSAGE = 'No AI clients connected yet';
export const CONNECTED_APPS_LOAD_ERROR_MESSAGE = 'Connected apps could not be loaded.';
export const REVOKE_ERROR_MESSAGE = 'The app could not be revoked. Try again.';
export const LOADING_CONNECTED_APPS_LABEL = 'Loading connected apps';
export const UNNAMED_CLIENT_LABEL = 'Unnamed AI client';
export const CHATGPT_INSTRUCTION = 'In ChatGPT open Settings → Connectors → Add custom connector and paste the URL.';
export const CONNECT_HEADING = 'Connect an AI client';
export const CONNECT_DESCRIPTION = 'Point your AI client at this address. It asks you to approve access the first time.';
export const MCP_URL_LABEL = 'MCP URL';
export const COPY_LABEL = 'Copy';
export const COPIED_LABEL = 'Copied';
export const CONNECTED_ON_LABEL = 'Connected';
export const REVOKE_LABEL = 'Revoke';

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
  [McpClient.ChatGpt]: (url) => `Settings → Connectors → Add custom connector → ${url}`,
};
