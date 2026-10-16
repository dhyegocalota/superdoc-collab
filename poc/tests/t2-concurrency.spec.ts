import { expect, test } from '@playwright/test';
import { groupIntoWindows } from '../lib/edit-windows';
import {
  AUTHORS,
  deletedTextBy,
  containsAll,
  expectConverged,
  insertedTextBy,
  openAuthors,
  reachesLength,
  readClientText,
  readServerViews,
  startStack,
  typeInParagraph,
  type Author,
  type Stack,
} from './harness';

const RULES = { idleGapMs: 1500, maxWindowMs: 60_000, coEditGapMs: 800 };
const BACKSPACED_IN_EVENT_ORDER = '>8#';

let stack: Stack;
test.afterEach(async () => stack.stop());

async function expectServerMatches({ clientText }: { clientText: string }) {
  await expect.poll(() => readServerViews(stack).liveText, { timeout: 30_000 }).toBe(clientText);
  const views = readServerViews(stack);
  expect(views.replayedText).toBe(views.liveText);
  expect(views.replayedStateVector).toBe(views.liveStateVector);
  return views;
}

test('T2: four authors type concurrently in different paragraphs', async ({ browser }) => {
  stack = await startStack('t2-different-paragraphs');
  const pages = await openAuthors({ browser, target: stack });
  const markers = AUTHORS.map((author) => ` <${author.toUpperCase()}#2>`);
  const isComplete = await reachesLength({ page: pages.ana, typed: markers });

  await Promise.all(
    AUTHORS.map((author, index) => typeInParagraph({ page: pages[author], paragraphOwner: author, text: markers[index], delayMs: 60 })),
  );

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete });
  const views = await expectServerMatches({ clientText });
  AUTHORS.forEach((author, index) => expect(insertedTextBy({ events: views.events, author })).toBe(markers[index]));

  const windows = groupIntoWindows({ events: views.events, rules: RULES });
  expect(windows.some((window) => window.coEdited && window.authorIds.length === AUTHORS.length)).toBe(true);
});

test('T3: four authors type concurrently in the same paragraph', async ({ browser }) => {
  stack = await startStack('t3-same-paragraph');
  const pages = await openAuthors({ browser, target: stack });
  const markers = AUTHORS.map((author) => ` <${author.toUpperCase()}#3>`);
  const expectedLength = (await readClientText(pages.ana)).length + markers.join('').length;

  await Promise.all(
    AUTHORS.map((author, index) => typeInParagraph({ page: pages[author], paragraphOwner: 'ana', text: markers[index], delayMs: 60 })),
  );

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete: (text) => text.length === expectedLength });
  const views = await expectServerMatches({ clientText });
  AUTHORS.forEach((author, index) => expect(insertedTextBy({ events: views.events, author })).toBe(markers[index]));
});

test('T8: deletions and replacements are attributed to the deleting author', async ({ browser }) => {
  stack = await startStack('t8-deletions');
  const pages = await openAuthors({ browser, target: stack });
  const typed: Record<Author, string> = { ana: ' <ANA#8>', bruno: '', caio: '', dani: '' };

  await typeInParagraph({ page: pages.ana, paragraphOwner: 'ana', text: typed.ana, delayMs: 30 });
  await expectConverged({ pages: Object.values(pages), isComplete: containsAll([typed.ana]) });

  await pages.bruno.locator('.superdoc-text-run', { hasText: 'owned by ana' }).first().click();
  await pages.bruno.keyboard.press('End');
  for (let index = 0; index < '#8>'.length; index++) await pages.bruno.keyboard.press('Backspace', { delay: 40 });

  await pages.caio.locator('.superdoc-text-run', { hasText: 'owned by caio' }).first().dblclick({ position: { x: 5, y: 5 } });
  await pages.caio.keyboard.type('Section', { delay: 40 });

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete: containsAll([' <ANA', 'Section']) });
  expect(clientText).not.toContain('#8>');
  const views = await expectServerMatches({ clientText });

  expect(insertedTextBy({ events: views.events, author: 'ana' })).toBe(typed.ana);
  expect(deletedTextBy({ events: views.events, author: 'bruno' })).toBe(BACKSPACED_IN_EVENT_ORDER);
  expect(insertedTextBy({ events: views.events, author: 'bruno' })).toBe('');
  expect(deletedTextBy({ events: views.events, author: 'caio' })).toBe('Paragraph');
  expect(insertedTextBy({ events: views.events, author: 'caio' })).toBe('Section');
});
