import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ToolErrorDetails = Record<string, string | number>;

export class AgentToolError extends Error {
  readonly details: ToolErrorDetails;

  constructor({ message, details = {} }: { message: string; details?: ToolErrorDetails }) {
    super(message);
    this.details = details;
  }
}

export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

export function errorResult({ message, details = {} }: { message: string; details?: ToolErrorDetails }): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: message, ...details }) }] };
}

export function absentAsNull<Value>(value: Value | undefined): Value | null {
  if (value === undefined) return null;
  return value;
}

export function required<Value>({ value, field, tool }: { value: Value | undefined; field: string; tool: string }): Value {
  if (value === undefined) throw new AgentToolError({ message: `${tool} requires ${field}` });
  return value;
}
