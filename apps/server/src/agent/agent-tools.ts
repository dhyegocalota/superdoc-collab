import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AgentTool, DOCUMENT_ROLE_RANK, DocumentRole, type AgentScope } from '@superdoc-history/types';
import { z } from 'zod';
import { DocumentNotFoundError, requireDocumentRole } from '../documents/require-document-role';
import type { AgentToolContext } from './agent-tool-context';
import type { AgentToolDefinition } from './agent-tool-definition';
import { DOCUMENT_TOOLS } from './document-tools';
import { READ_TOOLS } from './read-tools';
import { SHARE_TOOLS } from './share-tools';
import { AgentToolError, errorResult } from './tool-results';

export const FORBIDDEN_TOOL_MESSAGE = 'The connected app is not allowed to use this tool';
export const DOCUMENT_NOT_FOUND_MESSAGE = 'Document not found';

const documentTargetSchema = z.object({ documentId: z.string() });

export const AGENT_TOOLS: Record<AgentTool, AgentToolDefinition> = { ...READ_TOOLS, ...DOCUMENT_TOOLS, ...SHARE_TOOLS };

export function roleTooLowMessage(role: DocumentRole): string {
  return `Your role on this document is ${role}, which is too low for this tool`;
}

export function agentToolsFor(scopes: AgentScope[]): AgentTool[] {
  return Object.values(AgentTool).filter((tool) => scopes.includes(AGENT_TOOLS[tool].scope));
}

function requireRole({
  context,
  documentId,
  minimumRole,
}: {
  context: AgentToolContext;
  documentId: string;
  minimumRole: DocumentRole;
}): void {
  const { userId } = context.principal;
  const role = requireDocumentRole({ documents: context.services.documents, documentId, userId, minimumRole: DocumentRole.Reader });
  if (DOCUMENT_ROLE_RANK[role] < DOCUMENT_ROLE_RANK[minimumRole]) throw new AgentToolError({ message: roleTooLowMessage(role) });
}

function failureOf(error: unknown): CallToolResult {
  if (error instanceof AgentToolError) return errorResult({ message: error.message, details: error.details });
  if (error instanceof DocumentNotFoundError) return errorResult({ message: DOCUMENT_NOT_FOUND_MESSAGE });
  if (error instanceof z.ZodError)
    return errorResult({ message: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
  throw error;
}

export async function callAgentTool({
  tool,
  input,
  context,
}: {
  tool: AgentTool;
  input: unknown;
  context: AgentToolContext;
}): Promise<CallToolResult> {
  const definition = AGENT_TOOLS[tool];
  if (!context.principal.scopes.includes(definition.scope)) return errorResult({ message: FORBIDDEN_TOOL_MESSAGE });
  const target = documentTargetSchema.safeParse(input);
  try {
    if (target.success) requireRole({ context, documentId: target.data.documentId, minimumRole: definition.minimumRole });
    return await definition.handle({ input, context });
  } catch (error) {
    return failureOf(error);
  }
}
