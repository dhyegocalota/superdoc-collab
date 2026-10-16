import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const HEALTH_PATH = '/health';
const CHAT_COMPLETIONS_SUFFIX = '/chat/completions';
const GENERAL_TOPIC = 'General';
const FAIL_MARKER = 'FAIL-TOPICS';
const OK = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const SERVER_ERROR = 500;
const BLOCK_PATTERN = /<block id="([^"]+)">([\s\S]*?)<\/block>/g;
const TOPIC_PATTERN = /<topic id="([^"]*)" name="([^"]*)">/g;
const NAME_SEPARATOR = ':';

type ContentPart = { text?: string };
type ChatMessage = { role: string; content: string | ContentPart[] };

function port(): number {
  const value = Number(process.env.FAKE_OPENROUTER_PORT);
  if (!Number.isInteger(value)) throw new Error('FAKE_OPENROUTER_PORT must be an integer');
  return value;
}

function textOf(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.map((part) => part.text).join('');
}

function userPrompt(body: { messages: ChatMessage[] }): string {
  return body.messages.filter((message) => message.role === 'user').map((message) => textOf(message.content)).join('\n');
}

function topicNameOf(text: string): string {
  const separatorIndex = text.indexOf(NAME_SEPARATOR);
  if (separatorIndex < 0) return GENERAL_TOPIC;
  return text.slice(0, separatorIndex).trim();
}

function topicsAnswer(prompt: string): { topics: { name: string; blockIds: string[] }[] } {
  const grouped = [...prompt.matchAll(BLOCK_PATTERN)].reduce((groups, [, blockId, text]) => {
    const name = topicNameOf(text!);
    const blockIds = groups.get(name);
    if (!blockIds) return groups.set(name, [blockId!]);
    blockIds.push(blockId!);
    return groups;
  }, new Map<string, string[]>());
  return { topics: [...grouped].map(([name, blockIds]) => ({ name, blockIds })) };
}

function summariesAnswer(prompt: string): { summaries: { topicId: string; sentence: string }[] } {
  return { summaries: [...prompt.matchAll(TOPIC_PATTERN)].map(([, topicId, name]) => ({ topicId: topicId!, sentence: `Edits about ${name}.` })) };
}

function completion(answer: object): object {
  return {
    id: 'chatcmpl-fake',
    object: 'chat.completion',
    created: 0,
    model: 'fake',
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(answer) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send({ response, status, body }: { response: ServerResponse; status: number; body: object }): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function handleChat({ request, response }: { request: IncomingMessage; response: ServerResponse }): Promise<void> {
  const prompt = userPrompt(JSON.parse(await readBody(request)));
  if (prompt.includes(FAIL_MARKER)) return send({ response, status: SERVER_ERROR, body: { error: { message: FAIL_MARKER } } });
  if (prompt.includes('<topic id=')) return send({ response, status: OK, body: completion(summariesAnswer(prompt)) });
  send({ response, status: OK, body: completion(topicsAnswer(prompt)) });
}

createServer((request, response) => {
  if (request.method === 'GET' && request.url === HEALTH_PATH) return send({ response, status: OK, body: {} });
  if (request.method === 'POST' && request.url?.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    handleChat({ request, response }).catch((error: unknown) => send({ response, status: BAD_REQUEST, body: { error: { message: String(error) } } }));
    return;
  }
  send({ response, status: NOT_FOUND, body: {} });
}).listen(port(), '127.0.0.1');
