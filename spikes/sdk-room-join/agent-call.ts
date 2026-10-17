import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const [tool, rawArguments] = process.argv.slice(2);
const port = process.env.HISTORY_MCP_PORT;
if (!port) throw new Error('HISTORY_MCP_PORT is required.');
if (!tool) throw new Error('Usage: agent-call <tool> [json-arguments]');

const client = new Client({ name: 'claude-agent-call', version: '0.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/`)));
if (tool === 'tools/list') {
  console.log(JSON.stringify((await client.listTools()).tools.map(({ name, description }) => ({ name, description: description?.slice(0, 120) })), null, 2));
} else {
  const result = await client.callTool({ name: tool, arguments: rawArguments ? JSON.parse(rawArguments) : {} });
  console.log(JSON.stringify(result, null, 2));
}
await client.close();
