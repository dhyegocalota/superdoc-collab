import { expect, type Browser, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { readMainStoryText } from '../lib/document-content';
import { readEditEvents } from '../lib/document-history';
import type { EditEvent } from '../lib/edit-events';
import { buildSeedDocx } from '../lib/seed-docx';
import { replay } from '../lib/update-log';
import { ChaosProxy } from '../server/chaos-proxy';
import { startCollaborationServer, type RunningCollaborationServer } from '../server/collaboration-server';

export const AUTHORS = ['ana', 'bruno', 'caio', 'dani'];
export type Author = string;

const CLIENT_URL = 'http://127.0.0.1:5199';
const READY_TIMEOUT_MS = 120_000;
const CONVERGENCE_TIMEOUT_MS = 90_000;
const ROOM_PREFIX = 'sd2/v2.1/';

export const emailOf = (author: Author): string => `${author}@example.com`;

export type ClientTarget = {
  documentId: string;
  proxyPort: number;
};

export type Stack = ClientTarget & {
  roomName: string;
  databasePath: string;
  collaborationPort: number;
  proxy: ChaosProxy;
  collaboration: RunningCollaborationServer;
  restartCollaboration: (downtimeMs: number) => Promise<void>;
  stop: () => Promise<void>;
};

let nextPortBlock = 0;

export async function startStack(documentId: string): Promise<Stack> {
  const portBlock = 20_000 + (process.pid % 1000) * 10 + nextPortBlock++ * 2;
  const collaborationPort = portBlock;
  const proxyPort = portBlock + 1;
  const databasePath = join(mkdtempSync(join(tmpdir(), 'poc-')), 'history.sqlite');
  const proxy = new ChaosProxy({ listenPort: proxyPort, targetUrl: `ws://127.0.0.1:${collaborationPort}` });
  await proxy.listen();
  const stack: Stack = {
    documentId,
    proxyPort,
    roomName: `${ROOM_PREFIX}${documentId}`,
    databasePath,
    collaborationPort,
    proxy,
    collaboration: await startCollaborationServer({ port: collaborationPort, databasePath }),
    restartCollaboration: async (downtimeMs) => {
      await stack.collaboration.stop();
      await new Promise((resolve) => setTimeout(resolve, downtimeMs));
      stack.collaboration = await startCollaborationServer({ port: collaborationPort, databasePath });
    },
    stop: async () => {
      await proxy.close();
      await stack.collaboration.stop();
    },
  };
  return stack;
}

export async function openAuthor({ browser, target, author, mode, seedDocx }: { browser: Browser; target: ClientTarget; author: Author; mode: 'create' | 'join'; seedDocx: Buffer | null }): Promise<Page> {
  const page = await browser.newPage();
  if (seedDocx) await page.route('**/seed.docx', (route) => route.fulfill({ status: 200, body: seedDocx }));
  page.on('pageerror', (error) => console.log(`[${author} pageerror]`, String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') console.log(`[${author} ${message.type()}]`, message.text().slice(0, 400));
  });
  const serverUrl = `ws://127.0.0.1:${target.proxyPort}/${author}`;
  await page.goto(`${CLIENT_URL}/?user=${author}&mode=${mode}&server=${encodeURIComponent(serverUrl)}&document=${target.documentId}`);
  await page.waitForFunction(() => (window as any).poc?.ready === true, null, { timeout: READY_TIMEOUT_MS });
  return page;
}

export async function openAuthors({
  browser,
  target,
  authors = AUTHORS,
  seedDocx = null,
}: {
  browser: Browser;
  target: ClientTarget;
  authors?: Author[];
  seedDocx?: Buffer | null;
}): Promise<Record<Author, Page>> {
  const [creator, ...joiners] = authors;
  const creatorPage = await openAuthor({ browser, target, author: creator, mode: 'create', seedDocx });
  const joinerPages = await Promise.all(joiners.map((author) => openAuthor({ browser, target, author, mode: 'join', seedDocx })));
  return Object.fromEntries([[creator, creatorPage], ...joiners.map((author, index) => [author, joinerPages[index]])]);
}

export async function readClientText(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).poc.getText());
}

export const focusRecoveries: { paragraphOwner: Author; phase: 'click' | 'typing' }[] = [];

const EDITOR_INPUT_SELECTOR = 'textarea';

async function isEditorFocused(page: Page): Promise<boolean> {
  return page.evaluate((selector) => document.activeElement?.matches(selector) === true, EDITOR_INPUT_SELECTOR);
}

async function focusParagraphEnd({ page, paragraphOwner }: { page: Page; paragraphOwner: Author }): Promise<void> {
  let attempts = 0;
  await expect(async () => {
    attempts += 1;
    if (attempts > 1) focusRecoveries.push({ paragraphOwner, phase: 'click' });
    await page.locator('.superdoc-text-run', { hasText: `owned by ${paragraphOwner}` }).first().click();
    await page.keyboard.press('End');
    expect(await isEditorFocused(page)).toBe(true);
  }).toPass({ timeout: 30_000 });
}

export async function typeInParagraph({ page, paragraphOwner, text, delayMs }: { page: Page; paragraphOwner: Author; text: string; delayMs: number }): Promise<void> {
  await focusParagraphEnd({ page, paragraphOwner });
  for (const character of text) {
    if (!(await isEditorFocused(page))) {
      focusRecoveries.push({ paragraphOwner, phase: 'typing' });
      await focusParagraphEnd({ page, paragraphOwner });
    }
    await page.keyboard.type(character, { delay: delayMs });
  }
}

export async function expectConverged({ pages, isComplete }: { pages: Page[]; isComplete: (text: string) => boolean }): Promise<string> {
  let lastTexts: string[] = [];
  await expect
    .poll(
      async () => {
        lastTexts = await Promise.all(pages.map(readClientText));
        const allEqual = lastTexts.every((text) => text === lastTexts[0]);
        return allEqual && isComplete(lastTexts[0]);
      },
      { timeout: CONVERGENCE_TIMEOUT_MS, intervals: [250, 500, 1000] },
    )
    .toBe(true)
    .catch((error: Error) => {
      console.log('[diverged client texts]', JSON.stringify(lastTexts, null, 2));
      throw error;
    });
  return lastTexts[0];
}

export const containsAll = (markers: string[]) => (text: string) => markers.every((marker) => text.includes(marker));

export async function reachesLength({ page, typed }: { page: Page; typed: string[] }): Promise<(text: string) => boolean> {
  const expectedLength = (await readClientText(page)).length + typed.join('').length;
  return (text) => text.length === expectedLength;
}

export function countCaretAnomalies({ text, typed }: { text: string; typed: string[] }): number {
  return typed.filter((marker) => marker.length > 0 && !text.includes(marker)).length;
}

export type ServerViews = {
  liveText: string;
  replayedText: string;
  liveStateVector: string;
  replayedStateVector: string;
  events: EditEvent[];
};

export function readServerViews(stack: Stack): ServerViews {
  const live = stack.collaboration.server.documents.get(stack.roomName);
  if (!live) throw new Error(`Room ${stack.roomName} is not loaded.`);
  const updates = stack.collaboration.log.read({ documentName: stack.roomName, untilSequence: Number.MAX_SAFE_INTEGER });
  const replayed = replay(updates);
  return {
    liveText: readMainStoryText(live),
    replayedText: readMainStoryText(replayed),
    liveStateVector: Buffer.from(Y.encodeStateVector(live)).toString('base64'),
    replayedStateVector: Buffer.from(Y.encodeStateVector(replayed)).toString('base64'),
    events: readEditEvents({ log: stack.collaboration.log, documentName: stack.roomName }),
  };
}

export function insertedTextBy({ events, author }: { events: EditEvent[]; author: Author }): string {
  return events
    .filter((event) => event.authorIds.length === 1 && event.authorIds[0] === emailOf(author))
    .map((event) => event.inserted)
    .join('');
}

export function deletedTextBy({ events, author }: { events: EditEvent[]; author: Author }): string {
  return events
    .filter((event) => event.authorIds.length === 1 && event.authorIds[0] === emailOf(author))
    .map((event) => event.deleted)
    .join('');
}

export function insertedTextIn({ events, author, blockId }: { events: EditEvent[]; author: Author; blockId: string }): string {
  return insertedTextBy({ events: events.filter((event) => event.blockId === blockId), author });
}

export function expectEveryCharacterAccounted({ events, initialLength, finalLength }: { events: EditEvent[]; initialLength: number; finalLength: number }): void {
  const insertedTotal = events.reduce((sum, event) => sum + event.inserted.length, 0);
  const deletedTotal = events.reduce((sum, event) => sum + event.deleted.length, 0);
  expect(insertedTotal - deletedTotal).toBe(finalLength - initialLength);
}

export function seedFor(authors: Author[]): Promise<Buffer> {
  return buildSeedDocx(authors.map((author) => ({ text: `Paragraph owned by ${author}.`, trackedChanges: [] })));
}

export function markerOf({ author, tag }: { author: Author; tag: string }): string {
  return ` <${author.toUpperCase()}-${tag}>`;
}
