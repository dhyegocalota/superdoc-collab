import { ApiPath } from '@superdoc-history/types';
import { CopyButton } from './copy-button';
import {
  CHATGPT_INSTRUCTION,
  CONNECT_DESCRIPTION,
  CONNECT_HEADING,
  MCP_CLIENT_LABELS,
  MCP_SNIPPETS,
  MCP_URL_LABEL,
  McpClient,
} from './connected-apps-copy';

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

export function ConnectSnippets() {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{CONNECT_HEADING}</h2>
      <p className="text-sm text-muted-foreground">{CONNECT_DESCRIPTION}</p>
      <Snippet label={MCP_URL_LABEL} text={MCP_URL} />
      {Object.values(McpClient).map((client) => (
        <Snippet
          key={client}
          label={MCP_CLIENT_LABELS[client]}
          text={MCP_SNIPPETS[client](MCP_URL)}
          instruction={client === McpClient.ChatGpt ? CHATGPT_INSTRUCTION : undefined}
        />
      ))}
    </section>
  );
}
