import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClientSnippet } from './connect-snippets';
import { documentPrompts, EXAMPLE_PROMPTS_HEADING, LIBRARY_PROMPTS, MCP_CLIENT_LABELS, McpClient } from './connected-apps-copy';

function promptsFor({ title, canEdit }: { title: string | null; canEdit: boolean }): string[] {
  if (title === null) return LIBRARY_PROMPTS;
  return documentPrompts({ title, canEdit });
}

export function UseWithAiContent({ title, canEdit }: { title: string | null; canEdit: boolean }) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue={McpClient.ClaudeCode}>
        <TabsList>
          {Object.values(McpClient).map((client) => (
            <TabsTrigger key={client} value={client}>
              {MCP_CLIENT_LABELS[client]}
            </TabsTrigger>
          ))}
        </TabsList>
        {Object.values(McpClient).map((client) => (
          <TabsContent key={client} value={client}>
            <ClientSnippet client={client} />
          </TabsContent>
        ))}
      </Tabs>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{EXAMPLE_PROMPTS_HEADING}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {promptsFor({ title, canEdit }).map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
