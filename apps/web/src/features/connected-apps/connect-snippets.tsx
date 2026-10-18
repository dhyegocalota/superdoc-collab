import { ApiPath } from '@superdoc-collab/types';
import { CopyButton } from './copy-button';
import { CHATGPT_INSTRUCTION, MCP_CLIENT_LABELS, MCP_SNIPPETS, McpClient } from './connected-apps-copy';

const MCP_URL = `${window.location.origin}${ApiPath.Mcp}`;

function Snippet({ label, text, instruction }: { label: string; text: string; instruction?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
        <CopyButton subject={label} text={text} />
      </div>
      {instruction && <p className="text-sm text-muted-foreground">{instruction}</p>}
      <pre className="rounded-md bg-muted p-3 text-sm break-all whitespace-pre-wrap">{text}</pre>
    </div>
  );
}

export function ClientSnippet({ client }: { client: McpClient }) {
  return (
    <Snippet
      label={MCP_CLIENT_LABELS[client]}
      text={MCP_SNIPPETS[client](MCP_URL)}
      instruction={client === McpClient.ChatGpt ? CHATGPT_INSTRUCTION : undefined}
    />
  );
}
