import { expect, test } from '@playwright/test';
import { groupIntoWindows } from '../lib/edit-windows';
import { AUTHORS, containsAll, emailOf, expectConverged, insertedTextBy, openAuthors, readServerViews, startStack, typeInParagraph, type Stack } from './harness';

const RULES = { idleGapMs: 1500, maxWindowMs: 60_000, coEditGapMs: 800 };
const PAUSE_BETWEEN_TURNS_MS = 3000;

let stack: Stack;
test.afterEach(async () => stack.stop());

test('T1: four authors take sequential turns; history is exact', async ({ browser }) => {
  stack = await startStack('t1-sequential');
  const pages = await openAuthors({ browser, target: stack });
  const markers = AUTHORS.map((author) => ` <${author.toUpperCase()}#1>`);

  for (const [index, author] of AUTHORS.entries()) {
    await typeInParagraph({ page: pages[author], paragraphOwner: author, text: markers[index], delayMs: 40 });
    await pages[author].waitForTimeout(PAUSE_BETWEEN_TURNS_MS);
  }

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete: containsAll(markers) });
  await expect.poll(() => readServerViews(stack).liveText, { timeout: 30_000 }).toBe(clientText);
  const views = readServerViews(stack);

  expect(views.replayedText).toBe(views.liveText);
  expect(views.replayedStateVector).toBe(views.liveStateVector);
  AUTHORS.forEach((author, index) => {
    expect(insertedTextBy({ events: views.events, author })).toBe(markers[index]);
  });

  const windows = groupIntoWindows({ events: views.events, rules: RULES });
  expect(windows.map((window) => window.authorIds)).toEqual(AUTHORS.map((author) => [emailOf(author)]));
  expect(windows.every((window) => !window.coEdited)).toBe(true);
  console.log('T1 windows', windows.map(({ authorIds, insertedCharacters, startSequence, endSequence }) => ({ authorIds, insertedCharacters, startSequence, endSequence })));
});
