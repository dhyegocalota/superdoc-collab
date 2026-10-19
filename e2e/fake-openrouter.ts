import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const HEALTH_PATH = '/health';
const CHAT_COMPLETIONS_SUFFIX = '/chat/completions';
const GENERAL_TOPIC = 'General';
const FAIL_MARKER = 'FAIL-TOPICS';
const SUMMARY_FAIL_MARKER = 'FAIL-SUMMARY';
const SLOW_MARKER = 'SLOW-SUMMARY';
const STREAM_MARKER = 'STREAM-SUMMARY';
const SLOW_REPLY_DELAY_MS = 600;
const STREAM_WORD_DELAY_MS = 400;
const WORD_SEPARATOR = ' ';
const SELECTION_MARKER = '<selection>';
const SUMMARIES_MARKER = '<topic id=';
const CALLS_PATH = '/calls';
const AUTHOR_PATTERN = /<author name="([^"]*)">/g;
const EDIT_PATTERN = /<edit>/g;
const NAME_JOINER = ' and ';
const NAME_SEPARATOR_IN_LABEL = ', ';
const ESCAPED_CHARACTERS: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' };
const ESCAPE_PATTERN = /&(?:amp|lt|gt|quot);/g;
const OK = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const SERVER_ERROR = 500;
const BLOCK_PATTERN = /<block id="([^"]+)">([\s\S]*?)<\/block>/g;
const TOPIC_PATTERN = /<topic id="([^"]*)" name="([^"]*)">/g;
const NAME_SEPARATOR = ':';

const CallKind = { Topics: 'topics', Summaries: 'summaries', Selection: 'selection' } as const;
type CallKind = (typeof CallKind)[keyof typeof CallKind];

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
  return body.messages
    .filter((message) => message.role === 'user')
    .map((message) => textOf(message.content))
    .join('\n');
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
  return {
    summaries: [...prompt.matchAll(TOPIC_PATTERN)].map(([, topicId, name]) => ({ topicId: topicId!, sentence: `Edits about ${name}.` })),
  };
}

function unescapeXml(text: string): string {
  return text.replace(ESCAPE_PATTERN, (escaped) => ESCAPED_CHARACTERS[escaped]!);
}

function selectionAnswer(prompt: string): { sentence: string; authors: string[] } {
  const labels = [...prompt.matchAll(AUTHOR_PATTERN)].map(([, label]) => unescapeXml(label!));
  const authors = [...new Set(labels.flatMap((label) => label.split(NAME_SEPARATOR_IN_LABEL)))];
  const editCount = [...prompt.matchAll(EDIT_PATTERN)].length;
  return { sentence: `${authors.join(NAME_JOINER)} edited ${editCount} passages.`, authors };
}

const ANSWERS: Record<CallKind, (prompt: string) => object> = {
  [CallKind.Topics]: topicsAnswer,
  [CallKind.Summaries]: summariesAnswer,
  [CallKind.Selection]: selectionAnswer,
};

const calls: Record<CallKind, number> = { [CallKind.Topics]: 0, [CallKind.Summaries]: 0, [CallKind.Selection]: 0 };

function callKindOf(prompt: string): CallKind {
  if (prompt.includes(SELECTION_MARKER)) return CallKind.Selection;
  if (prompt.includes(SUMMARIES_MARKER)) return CallKind.Summaries;
  return CallKind.Topics;
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

function streamChunk({ delta, finishReason }: { delta: object; finishReason: string | null }): string {
  const chunk = {
    id: 'chatcmpl-fake',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'fake',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function jsonText(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

function wordPieces({ sentence, authors }: { sentence: string; authors: string[] }): string[] {
  const [first, ...rest] = sentence.split(WORD_SEPARATOR);
  return [
    `{"sentence":"${jsonText(first!)}`,
    ...rest.map((word) => `${WORD_SEPARATOR}${jsonText(word)}`),
    `","authors":${JSON.stringify(authors)}}`,
  ];
}

async function sendStream({
  response,
  pieces,
  pieceDelayMs,
}: {
  response: ServerResponse;
  pieces: string[];
  pieceDelayMs: number;
}): Promise<void> {
  response.writeHead(OK, { 'content-type': 'text/event-stream' });
  await pieces.reduce(async (previous, piece, index) => {
    await previous;
    if (index > 0) await pause(pieceDelayMs);
    const delta = index === 0 ? { role: 'assistant', content: piece } : { content: piece };
    response.write(streamChunk({ delta, finishReason: null }));
  }, Promise.resolve());
  response.write(streamChunk({ delta: {}, finishReason: 'stop' }));
  response.end('data: [DONE]\n\n');
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
  const body = JSON.parse(await readBody(request));
  const prompt = userPrompt(body);
  const kind = callKindOf(prompt);
  calls[kind] += 1;
  const isFailure = prompt.includes(FAIL_MARKER) || (kind === CallKind.Selection && prompt.includes(SUMMARY_FAIL_MARKER));
  if (isFailure) return send({ response, status: SERVER_ERROR, body: { error: { message: FAIL_MARKER } } });
  const isSelection = kind === CallKind.Selection;
  if (isSelection && prompt.includes(SLOW_MARKER)) await pause(SLOW_REPLY_DELAY_MS);
  const answer = ANSWERS[kind](prompt);
  if (body.stream !== true) return send({ response, status: OK, body: completion(answer) });
  if (isSelection && prompt.includes(STREAM_MARKER))
    return sendStream({ response, pieces: wordPieces(selectionAnswer(prompt)), pieceDelayMs: STREAM_WORD_DELAY_MS });
  return sendStream({ response, pieces: [JSON.stringify(answer)], pieceDelayMs: 0 });
}

createServer((request, response) => {
  if (request.method === 'GET' && request.url === HEALTH_PATH) return send({ response, status: OK, body: {} });
  if (request.method === 'GET' && request.url === CALLS_PATH) return send({ response, status: OK, body: calls });
  if (request.method === 'POST' && request.url?.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    handleChat({ request, response }).catch((error: unknown) =>
      send({ response, status: BAD_REQUEST, body: { error: { message: String(error) } } }),
    );
    return;
  }
  send({ response, status: NOT_FOUND, body: {} });
}).listen(port(), '127.0.0.1');
