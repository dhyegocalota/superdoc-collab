import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AgentScope, DocumentRole } from '@superdoc-history/types';
import type { z } from 'zod';
import type { AgentPerson, AgentToolContext } from './agent-tool-context';
import { AgentToolError } from './tool-results';

const UNKNOWN_PERSON_MESSAGE = 'The person behind this connection no longer exists';

export type AgentToolDefinition = {
  scope: AgentScope;
  minimumRole: DocumentRole;
  description: string;
  inputSchema: z.ZodObject;
  handle: (options: { input: unknown; context: AgentToolContext }) => Promise<CallToolResult> | CallToolResult;
};

export function defineTool<Schema extends z.ZodObject>({
  scope,
  minimumRole,
  description,
  inputSchema,
  handle,
}: {
  scope: AgentScope;
  minimumRole: DocumentRole;
  description: string;
  inputSchema: Schema;
  handle: (options: { input: z.infer<Schema>; context: AgentToolContext }) => Promise<CallToolResult> | CallToolResult;
}): AgentToolDefinition {
  return {
    scope,
    minimumRole,
    description,
    inputSchema,
    handle: ({ input, context }) => handle({ input: inputSchema.parse(input), context }),
  };
}

export function personOf(context: AgentToolContext): AgentPerson {
  const { userId } = context.principal;
  const contact = context.services.documents.userContacts([userId]).get(userId);
  if (!contact) throw new AgentToolError({ message: UNKNOWN_PERSON_MESSAGE });
  return { userId, name: contact.name, email: contact.email };
}
