import { expect, test, type Page } from '@playwright/test';
import { BlockChangeKind } from '../lib/edit-events';
import { IdentitySource } from '../lib/update-log';
import {
  deletedTextBy,
  emailOf,
  expectConverged,
  expectEveryCharacterAccounted,
  insertedTextBy,
  insertedTextIn,
  markerOf,
  openAuthor,
  openAuthors,
  reachesLength,
  readClientText,
  readServerViews,
  seedFor,
  startStack,
  typeInParagraph,
  type Author,
  type Stack,
} from './harness';

const EIGHT_AUTHORS = ['ana', 'bruno', 'caio', 'dani', 'enzo', 'fabi', 'gabi', 'hugo'];
const MAX_LATENCY_MS = 2000;
const STORM_CYCLES = 5;
const STORM_OUTAGE_MS = 1200;
const PASTE_LENGTH = 5000;

let stack: Stack;
test.afterEach(async () => stack.stop());

async function expectServerConsistent({ clientText, initialLength }: { clientText: string; initialLength: number }) {
  await expect.poll(() => readServerViews(stack).liveText, { timeout: 60_000 }).toBe(clientText);
  const views = readServerViews(stack);
  expect(views.replayedText).toBe(views.liveText);
  expect(views.replayedStateVector).toBe(views.liveStateVector);
  expectEveryCharacterAccounted({ events: views.events, initialLength, finalLength: clientText.length });
  return views;
}

function blockIdOf(index: number): string {
  return String(index + 1).padStart(8, '0');
}

test('E1: eight authors with latencies from 0 to 2000 ms type concurrently', async ({ browser }) => {
  stack = await startStack('e1-eight-authors');
  const pages = await openAuthors({ browser, target: stack, authors: EIGHT_AUTHORS, seedDocx: await seedFor(EIGHT_AUTHORS) });
  EIGHT_AUTHORS.forEach((author, index) =>
    stack.proxy.setConditions({ userKey: author, conditions: { latencyMs: Math.round((MAX_LATENCY_MS * index) / (EIGHT_AUTHORS.length - 1)), jitterMs: 150 } }),
  );
  const markers = Object.fromEntries(EIGHT_AUTHORS.map((author) => [author, markerOf({ author, tag: 'E1' })]));
  const initialLength = (await readClientText(pages.ana)).length;
  const isComplete = await reachesLength({ page: pages.ana, typed: Object.values(markers) });

  await Promise.all(EIGHT_AUTHORS.map((author) => typeInParagraph({ page: pages[author], paragraphOwner: author, text: markers[author], delayMs: 50 })));

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete });
  const views = await expectServerConsistent({ clientText, initialLength });
  EIGHT_AUTHORS.forEach((author) => expect(insertedTextBy({ events: views.events, author })).toBe(markers[author]));
});

test('E2: a late joiner receives the full history and is attributed correctly', async ({ browser }) => {
  const authors = ['ana', 'bruno', 'caio', 'dani', 'enzo'];
  const seedDocx = await seedFor(authors);
  stack = await startStack('e2-late-joiner');
  const earlyPages = await openAuthors({ browser, target: stack, authors: authors.slice(0, 4), seedDocx });
  const initialLength = (await readClientText(earlyPages.ana)).length;
  const early = Object.fromEntries(authors.slice(0, 4).map((author) => [author, markerOf({ author, tag: 'EARLY' })]));
  await Promise.all(authors.slice(0, 4).map((author) => typeInParagraph({ page: earlyPages[author], paragraphOwner: author, text: early[author], delayMs: 30 })));
  const earlyText = await expectConverged({ pages: Object.values(earlyPages), isComplete: (text) => text.length === initialLength + Object.values(early).join('').length });

  const enzo = await openAuthor({ browser, target: stack, author: 'enzo', mode: 'join', seedDocx });
  expect(await readClientText(enzo)).toBe(earlyText);
  const late = markerOf({ author: 'enzo', tag: 'LATE' });
  const isComplete = await reachesLength({ page: enzo, typed: [late] });
  await typeInParagraph({ page: enzo, paragraphOwner: 'enzo', text: late, delayMs: 30 });

  const clientText = await expectConverged({ pages: [...Object.values(earlyPages), enzo], isComplete });
  const views = await expectServerConsistent({ clientText, initialLength });
  expect(insertedTextBy({ events: views.events, author: 'enzo' })).toBe(late);
  authors.slice(0, 4).forEach((author) => expect(insertedTextBy({ events: views.events, author })).toBe(early[author]));
});

test('E3: the same user in two tabs is one author with two Yjs clients', async ({ browser }) => {
  stack = await startStack('e3-two-tabs');
  const pages = await openAuthors({ browser, target: stack, authors: ['ana', 'bruno'] });
  const secondTab = await openAuthor({ browser, target: stack, author: 'ana', mode: 'join', seedDocx: null });
  const initialLength = (await readClientText(pages.ana)).length;
  const firstTabMarker = markerOf({ author: 'ana', tag: 'TAB1' });
  const secondTabMarker = markerOf({ author: 'ana', tag: 'TAB2' });
  const isComplete = await reachesLength({ page: pages.ana, typed: [firstTabMarker, secondTabMarker] });

  await Promise.all([
    typeInParagraph({ page: pages.ana, paragraphOwner: 'ana', text: firstTabMarker, delayMs: 40 }),
    typeInParagraph({ page: secondTab, paragraphOwner: 'caio', text: secondTabMarker, delayMs: 40 }),
  ]);

  const clientText = await expectConverged({ pages: [pages.ana, pages.bruno, secondTab], isComplete });
  const views = await expectServerConsistent({ clientText, initialLength });
  expect(insertedTextIn({ events: views.events, author: 'ana', blockId: blockIdOf(0) })).toBe(firstTabMarker);
  expect(insertedTextIn({ events: views.events, author: 'ana', blockId: blockIdOf(2) })).toBe(secondTabMarker);
  const anaClientIds = [...stack.collaboration.log.clientIdentities(stack.roomName)].filter(([, userId]) => userId === emailOf('ana'));
  expect(anaClientIds.length).toBeGreaterThanOrEqual(2);
  const liveRoom = stack.collaboration.server.documents.get(stack.roomName);
  if (!liveRoom) throw new Error('Room is not loaded.');
  const awarenessIdentities = [...liveRoom.awareness.getStates().entries()].map(([clientId, state]) => [clientId, (state as { userId: string }).userId]);
  const declared = stack.collaboration.log.clientIdentities(stack.roomName);
  const sources = stack.collaboration.log.identitySources(stack.roomName);
  expect(awarenessIdentities).toHaveLength(3);
  awarenessIdentities.forEach(([clientId, userId]) => {
    expect(declared.get(clientId as number)).toBe(userId);
    expect(sources.get(clientId as number)).toBe(IdentitySource.Declared);
  });
});

test('E4: everyone leaves, the room unloads, the server restarts cold, history survives', async ({ browser }) => {
  stack = await startStack('e4-cold-load');
  const pages = await openAuthors({ browser, target: stack, authors: ['ana', 'bruno'] });
  const initialLength = (await readClientText(pages.ana)).length;
  const before = { ana: markerOf({ author: 'ana', tag: 'BEFORE' }), bruno: markerOf({ author: 'bruno', tag: 'BEFORE' }) };
  await Promise.all((['ana', 'bruno'] as const).map((author) => typeInParagraph({ page: pages[author], paragraphOwner: author, text: before[author], delayMs: 30 })));
  const textBeforeLeaving = await expectConverged({ pages: Object.values(pages), isComplete: (text) => text.length === initialLength + before.ana.length + before.bruno.length });

  await Promise.all(Object.values(pages).map((page: Page) => page.close()));
  await expect.poll(() => stack.collaboration.server.documents.has(stack.roomName), { timeout: 30_000 }).toBe(false);
  await stack.restartCollaboration(0);

  const caio = await openAuthor({ browser, target: stack, author: 'caio', mode: 'join', seedDocx: null });
  expect(await readClientText(caio)).toBe(textBeforeLeaving);
  const after = markerOf({ author: 'caio', tag: 'AFTER' });
  const isComplete = await reachesLength({ page: caio, typed: [after] });
  await typeInParagraph({ page: caio, paragraphOwner: 'caio', text: after, delayMs: 30 });

  const clientText = await expectConverged({ pages: [caio], isComplete });
  const views = await expectServerConsistent({ clientText, initialLength });
  expect(insertedTextBy({ events: views.events, author: 'ana' })).toBe(before.ana);
  expect(insertedTextBy({ events: views.events, author: 'bruno' })).toBe(before.bruno);
  expect(insertedTextBy({ events: views.events, author: 'caio' })).toBe(after);
});

test('E5: two authors edit the same paragraph while both offline, then reconcile', async ({ browser }) => {
  stack = await startStack('e5-offline-conflict');
  const pages = await openAuthors({ browser, target: stack, authors: ['ana', 'bruno', 'caio'] });
  const initialLength = (await readClientText(pages.ana)).length;
  const markers = Object.fromEntries(['ana', 'bruno', 'caio'].map((author) => [author, markerOf({ author, tag: 'CONFLICT' })]));
  const isComplete = await reachesLength({ page: pages.ana, typed: Object.values(markers) });

  stack.proxy.cut('bruno');
  stack.proxy.cut('caio');
  await pages.ana.waitForTimeout(800);
  await Promise.all(['ana', 'bruno', 'caio'].map((author) => typeInParagraph({ page: pages[author], paragraphOwner: 'dani', text: markers[author], delayMs: 40 })));
  expect(await readClientText(pages.ana)).not.toContain('BRUNO-CONFLICT');
  stack.proxy.heal('bruno');
  stack.proxy.heal('caio');

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete });
  const views = await expectServerConsistent({ clientText, initialLength });
  ['ana', 'bruno', 'caio'].forEach((author) => expect(insertedTextIn({ events: views.events, author, blockId: blockIdOf(3) })).toBe(markers[author]));
});

test('E6: two offline authors delete the same text; it is deleted and attributed once', async ({ browser }) => {
  stack = await startStack('e6-double-delete');
  const pages = await openAuthors({ browser, target: stack, authors: ['ana', 'bruno', 'caio'] });
  const initialLength = (await readClientText(pages.ana)).length;
  const shared = ' <SHARED-DELETE>';
  await typeInParagraph({ page: pages.ana, paragraphOwner: 'ana', text: shared, delayMs: 20 });
  await expectConverged({ pages: Object.values(pages), isComplete: (text) => text.includes(shared) });

  stack.proxy.cut('bruno');
  stack.proxy.cut('caio');
  await pages.ana.waitForTimeout(800);
  await Promise.all(
    ['bruno', 'caio'].map(async (author) => {
      await typeInParagraph({ page: pages[author], paragraphOwner: 'ana', text: '', delayMs: 0 });
      for (let index = 0; index < shared.length; index++) await pages[author].keyboard.press('Backspace', { delay: 30 });
    }),
  );
  stack.proxy.heal('bruno');
  stack.proxy.heal('caio');

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete: (text) => text.length === initialLength });
  const views = await expectServerConsistent({ clientText, initialLength });
  const deletedByBruno = deletedTextBy({ events: views.events, author: 'bruno' });
  const deletedByCaio = deletedTextBy({ events: views.events, author: 'caio' });
  expect(deletedByBruno.length + deletedByCaio.length).toBe(shared.length);
  console.log('E6 deletion split', { bruno: deletedByBruno.length, caio: deletedByCaio.length });
});

test('E7: new paragraphs and paragraph merges are attributed to the acting author', async ({ browser }) => {
  stack = await startStack('e7-structure');
  const pages = await openAuthors({ browser, target: stack, authors: ['ana', 'bruno'] });
  const initialLength = (await readClientText(pages.ana)).length;
  const newParagraph = 'NEW-PARAGRAPH-BY-ANA';

  await typeInParagraph({ page: pages.ana, paragraphOwner: 'ana', text: '', delayMs: 0 });
  await pages.ana.keyboard.press('Enter');
  await pages.ana.keyboard.type(newParagraph, { delay: 30 });
  await expectConverged({ pages: Object.values(pages), isComplete: (text) => text.includes(newParagraph) });

  const mergeReceipt = await pages.bruno.evaluate(async () => {
    const paragraph = (nodeId: string) => ({ kind: 'block' as const, nodeType: 'paragraph' as const, nodeId });
    return (window as any).poc.documentApi().blocks.merge({ first: paragraph('00000002'), second: paragraph('00000003') });
  });
  expect(mergeReceipt.success).toBe(true);
  const mergedEvents = () => readServerViews(stack).events.filter((event) => event.kind === BlockChangeKind.Merged);
  await expect.poll(() => mergedEvents().length, { timeout: 30_000 }).toBe(1);

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete: (text) => text.length === initialLength + newParagraph.length });
  const views = await expectServerConsistent({ clientText, initialLength });
  const createdByAna = views.events.filter((event) => event.kind === BlockChangeKind.Created && event.authorIds[0] === emailOf('ana'));
  const mergedByBruno = views.events.filter((event) => event.kind === BlockChangeKind.Merged && event.authorIds[0] === emailOf('bruno'));
  expect(createdByAna.length).toBeGreaterThanOrEqual(1);
  expect(mergedByBruno.map((event) => event.blockId)).toEqual(['00000003']);
  expect(insertedTextBy({ events: views.events, author: 'bruno' })).toBe('');
  expect(deletedTextBy({ events: views.events, author: 'bruno' })).toBe('');
  expect(insertedTextBy({ events: views.events, author: 'ana' })).toBe(newParagraph);
});

test('E8: undo is recorded as a deletion by the author who undid', async ({ browser }) => {
  stack = await startStack('e8-undo');
  const pages = await openAuthors({ browser, target: stack, authors: ['ana', 'bruno'] });
  const initialLength = (await readClientText(pages.ana)).length;
  const marker = markerOf({ author: 'ana', tag: 'UNDO-ME' });
  await typeInParagraph({ page: pages.ana, paragraphOwner: 'ana', text: marker, delayMs: 20 });
  await expectConverged({ pages: Object.values(pages), isComplete: (text) => text.includes(marker) });

  await pages.ana.keyboard.press('ControlOrMeta+z');

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete: (text) => text.length < initialLength + marker.length });
  const views = await expectServerConsistent({ clientText, initialLength });
  const removed = deletedTextBy({ events: views.events, author: 'ana' });
  const sortedCharacters = (text: string) => [...text].sort().join('');
  expect(sortedCharacters(removed)).toBe(sortedCharacters(marker));
  expect(views.events.every((event) => event.authorIds[0] === emailOf('ana'))).toBe(true);
});

test('E9: a large paste is a single attributed insertion alongside live typing', async ({ browser }) => {
  stack = await startStack('e9-paste');
  const pages = await openAuthors({ browser, target: stack, authors: ['ana', 'bruno'] });
  const initialLength = (await readClientText(pages.ana)).length;
  const pasted = ' ' + Array.from({ length: PASTE_LENGTH / 10 }, (_, index) => `chunk${String(index).padStart(4, '0')}`).join('').slice(0, PASTE_LENGTH - 1);
  const typed = markerOf({ author: 'ana', tag: 'TYPING' });
  const isComplete = await reachesLength({ page: pages.ana, typed: [pasted, typed] });

  await Promise.all([
    (async () => {
      await typeInParagraph({ page: pages.bruno, paragraphOwner: 'bruno', text: '', delayMs: 0 });
      await pages.bruno.keyboard.insertText(pasted);
    })(),
    typeInParagraph({ page: pages.ana, paragraphOwner: 'ana', text: typed, delayMs: 40 }),
  ]);

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete });
  const views = await expectServerConsistent({ clientText, initialLength });
  expect(insertedTextBy({ events: views.events, author: 'bruno' })).toBe(pasted);
  expect(insertedTextBy({ events: views.events, author: 'ana' })).toBe(typed);
});

test('E11: reconnect storm — all eight authors drop and return together while typing', async ({ browser }) => {
  stack = await startStack('e11-storm');
  const pages = await openAuthors({ browser, target: stack, authors: EIGHT_AUTHORS, seedDocx: await seedFor(EIGHT_AUTHORS) });
  EIGHT_AUTHORS.forEach((author, index) => stack.proxy.setConditions({ userKey: author, conditions: { latencyMs: index * 100, jitterMs: 100 } }));
  const markers: Record<Author, string> = Object.fromEntries(
    EIGHT_AUTHORS.map((author) => [author, Array.from({ length: STORM_CYCLES }, (_, cycle) => markerOf({ author, tag: `S${cycle}` })).join('')]),
  );
  const initialLength = (await readClientText(pages.ana)).length;
  const isComplete = await reachesLength({ page: pages.ana, typed: Object.values(markers) });

  const typing = EIGHT_AUTHORS.map(async (author) => {
    for (let cycle = 0; cycle < STORM_CYCLES; cycle++) {
      await typeInParagraph({ page: pages[author], paragraphOwner: author, text: markerOf({ author, tag: `S${cycle}` }), delayMs: 60 });
    }
  });
  const storm = (async () => {
    for (let cycle = 0; cycle < STORM_CYCLES; cycle++) {
      EIGHT_AUTHORS.forEach((author) => stack.proxy.cut(author));
      await pages.ana.waitForTimeout(STORM_OUTAGE_MS);
      EIGHT_AUTHORS.forEach((author) => stack.proxy.heal(author));
      await pages.ana.waitForTimeout(STORM_OUTAGE_MS);
    }
  })();
  await Promise.all([...typing, storm]);

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete });
  const views = await expectServerConsistent({ clientText, initialLength });
  EIGHT_AUTHORS.forEach((author) => expect(insertedTextBy({ events: views.events, author })).toBe(markers[author]));
  console.log('E11 connections', Object.fromEntries(stack.proxy.connectionsByUser));
});
