import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AgentTool } from '@superdoc-history/types';
import type { AgentToolContext } from './agent-tool-context';

export const FORBIDDEN_TOOL_MESSAGE = 'The connected app is not allowed to use this tool';
export const DOCUMENT_NOT_FOUND_MESSAGE = 'Document not found';

export function roleTooLowMessage(role: string): string {
  throw new Error(`roleTooLowMessage is not implemented for ${role}`);
}

export function callAgentTool(_options: { tool: AgentTool; input: unknown; context: AgentToolContext }): Promise<CallToolResult> {
  throw new Error('callAgentTool is not implemented');
}
