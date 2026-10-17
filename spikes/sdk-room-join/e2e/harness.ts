import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, type Browser, type Page } from '@playwright/test';
import { join } from 'node:path';

export const CLIENT_URL = 'http://127.0.0.1:5198';
export const COLLABORATION_PORT = 4712;
const READY_TIMEOUT_MS = 120_000;
const CONVERGENCE_TIMEOUT_MS = 60_000;
const EDITOR_INPUT_SELECTOR = 'textarea';
const SPIKE_ROOT = join(import.meta.dirname, '..');

export type TrackedChange = { id: string; type: string; state: string; author?: { name?: string }; authorName?: string };
export type AgentTool = { name: string; description?: string };
export type Agent = {
  client: Client;
  listTools: () => Promise<AgentTool[]>;
  call: <Result>(name: string, args: Record<string, unknown>) => Promise<Result>;
  stop: () => Promise<void>;
};

export async function openHuman({ browser, author, mode, documentId }: { browser: Browser; author: string; mode: 'create' | 'join'; documentId: string }): Promise<Page> {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.log(`[${author} pageerror]`, String(error)));
  const serverUrl = `ws://127.0.0.1:${COLLABORATION_PORT}`;
  await page.goto(`${CLIENT_URL}/?user=${author}&mode=${mode}&server=${encodeURIComponent(serverUrl)}&document=${documentId}`);
  await page.waitForFunction(() => (window as unknown as { poc?: { ready: boolean } }).poc?.ready === true, null, { timeout: READY_TIMEOUT_MS });
  return page;
}

export function readClientText(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { poc: { getText: () => Promise<string> } }).poc.getText());
}

export async function readClientTrackedChanges(page: Page): Promise<TrackedChange[]> {
  const listed = await page.evaluate(() => (window as unknown as { poc: { documentApi: () => { trackChanges: { list: (input: object) => unknown } } } }).poc.documentApi().trackChanges.list({}));
  return (listed as { items: TrackedChange[] }).items;
}

export function decideClientTrackedChange({ page, id, decision }: { page: Page; id: string; decision: 'accept' | 'reject' }): Promise<unknown> {
  return page.evaluate(
    ({ id, decision }) => (window as unknown as { poc: { documentApi: () => { trackChanges: { decide: (input: object) => unknown } } } }).poc.documentApi().trackChanges.decide({ decision, target: { kind: 'id', id } }),
    { id, decision },
  );
}

async function isEditorFocused(page: Page): Promise<boolean> {
  return page.evaluate((selector) => document.activeElement?.matches(selector) === true, EDITOR_INPUT_SELECTOR);
}

async function focusParagraphEnd({ page, paragraphOwner }: { page: Page; paragraphOwner: string }): Promise<void> {
  await expect(async () => {
    await page.locator('.superdoc-text-run', { hasText: `owned by ${paragraphOwner}` }).first().click();
    await page.keyboard.press('End');
    expect(await isEditorFocused(page)).toBe(true);
  }).toPass({ timeout: 30_000 });
}

export async function typeInParagraph({ page, paragraphOwner, text, delayMs }: { page: Page; paragraphOwner: string; text: string; delayMs: number }): Promise<void> {
  await focusParagraphEnd({ page, paragraphOwner });
  for (const character of text) {
    if (!(await isEditorFocused(page))) await focusParagraphEnd({ page, paragraphOwner });
    await page.keyboard.type(character, { delay: delayMs });
  }
}

export async function expectClientText({ pages, isComplete }: { pages: Page[]; isComplete: (text: string) => boolean }): Promise<string> {
  let lastTexts: string[] = [];
  await expect
    .poll(
      async () => {
        lastTexts = await Promise.all(pages.map(readClientText));
        return lastTexts.every((text) => text === lastTexts[0]) && isComplete(lastTexts[0]);
      },
      { timeout: CONVERGENCE_TIMEOUT_MS, intervals: [250, 500, 1000] },
    )
    .toBe(true)
    .catch((error: Error) => {
      console.log('[client texts]', JSON.stringify(lastTexts, null, 2));
      throw error;
    });
  return lastTexts[0];
}

function parseToolResult<Result>(result: unknown): Result {
  const { content, isError } = result as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  const text = content.find((item) => item.type === 'text')?.text;
  if (text === undefined) throw new Error('The tool returned no text content.');
  if (isError) throw new Error(text);
  return JSON.parse(text) as Result;
}

export async function startAgent({ token, name }: { token: string; name: string }): Promise<Agent> {
  const transport = new StdioClientTransport({
    command: 'pnpm',
    args: ['exec', 'tsx', 'mcp-server.ts'],
    cwd: SPIKE_ROOT,
    env: { ...(process.env as Record<string, string>), HISTORY_COLLABORATION_URL: `ws://127.0.0.1:${COLLABORATION_PORT}`, HISTORY_AGENT_TOKEN: token, HISTORY_AGENT_NAME: name },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer) => console.log('[mcp-server stderr]', chunk.toString().slice(0, 400)));
  const client = new Client({ name: 'spike-agent', version: '0.0.0' });
  await client.connect(transport);
  return {
    client,
    listTools: async () => (await client.listTools()).tools,
    call: async (name, args) => parseToolResult(await client.callTool({ name, arguments: args })),
    stop: () => client.close(),
  };
}
