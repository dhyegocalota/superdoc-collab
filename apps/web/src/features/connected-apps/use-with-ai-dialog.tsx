import { AppRoute } from '@superdoc-collab/types';
import { Bot } from 'lucide-react';
import type { RefObject } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClientSnippet } from './connect-snippets';
import {
  CLOSE_LABEL,
  documentPrompts,
  EXAMPLE_PROMPTS_HEADING,
  LIBRARY_PROMPTS,
  MANAGE_CONNECTED_APPS_LABEL,
  MCP_CLIENT_LABELS,
  McpClient,
  USE_WITH_AI_DESCRIPTION,
  USE_WITH_AI_LABEL,
  USE_WITH_AI_TITLE,
} from './connected-apps-copy';

const DIALOG_CLASS_NAME = 'max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[560px]';

function promptsFor({ title, canEdit }: { title: string | null; canEdit: boolean }): string[] {
  if (title === null) return LIBRARY_PROMPTS;
  return documentPrompts({ title, canEdit });
}

export type UseWithAiSlot = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function UseWithAiDialog({
  title,
  canEdit,
  isOpen,
  onOpenChange,
  returnFocusRef,
}: UseWithAiSlot & { title: string | null; canEdit: boolean }) {
  const isControlled = isOpen !== undefined;

  function returnFocus(event: Event): void {
    if (!returnFocusRef) return;
    event.preventDefault();
    returnFocusRef.current?.focus();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <Bot aria-hidden />
            {USE_WITH_AI_LABEL}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className={DIALOG_CLASS_NAME} onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{USE_WITH_AI_TITLE}</DialogTitle>
          <DialogDescription>{USE_WITH_AI_DESCRIPTION}</DialogDescription>
        </DialogHeader>
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
        <DialogFooter>
          <Button asChild variant="outline">
            <Link to={AppRoute.ConnectedApps}>{MANAGE_CONNECTED_APPS_LABEL}</Link>
          </Button>
          <DialogClose asChild>
            <Button variant="outline">{CLOSE_LABEL}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
