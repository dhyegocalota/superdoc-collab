import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AgentScope, DocumentRole } from '@superdoc-history/types';
import { z } from 'zod';
import type { AgentPerson, AgentToolContext } from './agent-tool-context';
import { AgentToolError } from './tool-results';

const UNKNOWN_PERSON_MESSAGE = 'The person behind this connection no longer exists';

export const documentInput = { documentId: z.string().min(1).describe('The document id from list_documents') };
export const documentTargetSchema = z.object(documentInput);

type ToolHandler<Input> = (options: { input: Input; context: AgentToolContext }) => Promise<CallToolResult> | CallToolResult;

export type AgentToolDefinition = {
  scope: AgentScope;
  minimumRole: DocumentRole;
  targetsDocument: boolean;
  description: string;
  inputSchema: z.ZodObject;
  handle: (options: { input: unknown; context: AgentToolContext }) => Promise<CallToolResult> | CallToolResult;
};

export function defineDocumentTool<Shape extends z.ZodRawShape>({
  scope,
  minimumRole,
  description,
  shape,
  handle,
}: {
  scope: AgentScope;
  minimumRole: DocumentRole;
  description: string;
  shape: Shape;
  handle: ToolHandler<z.infer<z.ZodObject<Shape & typeof documentInput>>>;
}): AgentToolDefinition {
  const inputSchema = z.object({ ...documentInput, ...shape });
  return {
    scope,
    minimumRole,
    targetsDocument: true,
    description,
    inputSchema,
    handle: ({ input, context }) => handle({ input: inputSchema.parse(input), context }),
  };
}

export function definePersonTool({
  scope,
  description,
  handle,
}: {
  scope: AgentScope;
  description: string;
  handle: ToolHandler<object>;
}): AgentToolDefinition {
  const inputSchema = z.object({});
  return {
    scope,
    minimumRole: DocumentRole.Reader,
    targetsDocument: false,
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
