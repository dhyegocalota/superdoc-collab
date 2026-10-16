import { expect, test } from '@playwright/test';
import { resolveAuthorIds } from '../lib/edit-events';
import {
  AUTHORS,
  countCaretAnomalies,
  focusRecoveries,
  emailOf,
  expectConverged,
  insertedTextBy,
  openAuthors,
  reachesLength,
  readServerViews,
  startStack,
  typeInParagraph,
  type Author,
  type Stack,
} from './harness';

const LATENCY_PROFILES: Record<Author, { latencyMs: number; jitterMs: number }> = {
  ana: { latencyMs: 0, jitterMs: 0 },
  bruno: { latencyMs: 150, jitterMs: 50 },
  caio: { latencyMs: 600, jitterMs: 200 },
  dani: { latencyMs: 1500, jitterMs: 500 },
};
const FLAP_ROUNDS = 6;
const FLAP_INTERVAL_MS = 1500;
const RESTART_DOWNTIME_MS = 3000;

let stack: Stack;
test.afterEach(async () => stack.stop());

async function expectHistoryExact({ markersByAuthor, clientText }: { markersByAuthor: Record<Author, string>; clientText: string }) {
  await expect.poll(() => readServerViews(stack).liveText, { timeout: 60_000 }).toBe(clientText);
  const views = readServerViews(stack);
  expect(views.replayedText).toBe(views.liveText);
  expect(views.replayedStateVector).toBe(views.liveStateVector);
  AUTHORS.forEach((author) => expect(insertedTextBy({ events: views.events, author })).toBe(markersByAuthor[author]));
  expect(views.events.every((event) => event.authorIds.length === 1)).toBe(true);
  return views;
}

function countRelayedUpdates(): number {
  const identities = stack.collaboration.log.clientIdentities(stack.roomName);
  const updates = stack.collaboration.log.read({ documentName: stack.roomName, untilSequence: Number.MAX_SAFE_INTEGER });
  return updates.filter((update) => resolveAuthorIds({ update, identities }).some((authorId) => authorId !== update.connectionUserId)).length;
}

test('T4: per-author latency with jitter', async ({ browser }) => {
  stack = await startStack('t4-latency');
  const pages = await openAuthors({ browser, target: stack });
  AUTHORS.forEach((author) => stack.proxy.setConditions({ userKey: author, conditions: LATENCY_PROFILES[author] }));
  const markersByAuthor = Object.fromEntries(AUTHORS.map((author) => [author, ` <${author.toUpperCase()}#4>`])) as Record<Author, string>;
  const isComplete = await reachesLength({ page: pages.ana, typed: Object.values(markersByAuthor) });

  await Promise.all(
    AUTHORS.map((author) => typeInParagraph({ page: pages[author], paragraphOwner: author, text: markersByAuthor[author], delayMs: 50 })),
  );

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete });
  await expectHistoryExact({ markersByAuthor, clientText });
});

test('T5: an author keeps typing while offline, then reconnects', async ({ browser }) => {
  stack = await startStack('t5-offline');
  const pages = await openAuthors({ browser, target: stack });
  const markersByAuthor: Record<Author, string> = { ana: ' <ANA#5>', bruno: ' <BRUNO-OFFLINE#5>', caio: ' <CAIO#5>', dani: '' };
  const isComplete = await reachesLength({ page: pages.ana, typed: Object.values(markersByAuthor) });

  stack.proxy.cut('bruno');
  await pages.bruno.waitForTimeout(1000);
  await typeInParagraph({ page: pages.bruno, paragraphOwner: 'bruno', text: markersByAuthor.bruno, delayMs: 40 });
  await Promise.all([
    typeInParagraph({ page: pages.ana, paragraphOwner: 'ana', text: markersByAuthor.ana, delayMs: 40 }),
    typeInParagraph({ page: pages.caio, paragraphOwner: 'caio', text: markersByAuthor.caio, delayMs: 40 }),
  ]);
  await pages.ana.waitForTimeout(2000);
  const onlineText = await pages.ana.evaluate(() => (window as any).poc.getText());
  expect(onlineText).not.toContain('BRUNO-OFFLINE');
  expect(await pages.bruno.evaluate(() => (window as any).poc.getText())).toContain('BRUNO-OFFLINE');

  const healedAt = Date.now();
  stack.proxy.heal('bruno');

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete });
  const views = await expectHistoryExact({ markersByAuthor, clientText });
  const brunoEvents = views.events.filter((event) => event.authorIds[0] === emailOf('bruno'));
  expect(brunoEvents.every((event) => event.serverTime >= healedAt)).toBe(true);
  console.log('T5 bruno connections through proxy:', stack.proxy.connectionsByUser.get('bruno'), 'relayed updates:', countRelayedUpdates());
});

test('T6: every author flaps (cut/heal) while typing', async ({ browser }) => {
  stack = await startStack('t6-flapping');
  const pages = await openAuthors({ browser, target: stack });
  AUTHORS.forEach((author) => stack.proxy.setConditions({ userKey: author, conditions: LATENCY_PROFILES[author] }));
  const markersByAuthor = Object.fromEntries(
    AUTHORS.map((author) => [author, Array.from({ length: FLAP_ROUNDS }, (_, round) => ` <${author.toUpperCase()}-${round}>`).join('')]),
  ) as Record<Author, string>;
  const isComplete = await reachesLength({ page: pages.ana, typed: Object.values(markersByAuthor) });

  const typing = AUTHORS.map(async (author) => {
    for (let round = 0; round < FLAP_ROUNDS; round++) {
      await typeInParagraph({ page: pages[author], paragraphOwner: author, text: ` <${author.toUpperCase()}-${round}>`, delayMs: 45 });
    }
  });
  const flapping = (async () => {
    for (let round = 0; round < FLAP_ROUNDS; round++) {
      const victims = AUTHORS.filter((_, index) => (index + round) % 2 === 0);
      victims.forEach((author) => stack.proxy.cut(author));
      await pages.ana.waitForTimeout(FLAP_INTERVAL_MS);
      victims.forEach((author) => stack.proxy.heal(author));
      await pages.ana.waitForTimeout(FLAP_INTERVAL_MS / 2);
    }
  })();
  await Promise.all([...typing, flapping]);
  AUTHORS.forEach((author) => stack.proxy.heal(author));

  const clientText = await expectConverged({ pages: Object.values(pages), isComplete });
  await expectHistoryExact({ markersByAuthor, clientText });
  console.log('T6 caret anomalies:', countCaretAnomalies({ text: clientText, typed: Object.values(markersByAuthor) }));
  console.log('T6 connections per author:', Object.fromEntries(stack.proxy.connectionsByUser), 'relayed updates:', countRelayedUpdates());
});

test('T7: server restarts mid-session; no lost or duplicated history', async ({ browser }) => {
  stack = await startStack('t7-restart');
  const pages = await openAuthors({ browser, target: stack });
  const before = Object.fromEntries(AUTHORS.map((author) => [author, ` <${author.toUpperCase()}-PRE>`])) as Record<Author, string>;
  const after = Object.fromEntries(AUTHORS.map((author) => [author, ` <${author.toUpperCase()}-POST>`])) as Record<Author, string>;

  const isBeforeComplete = await reachesLength({ page: pages.ana, typed: Object.values(before) });
  await Promise.all(AUTHORS.map((author) => typeInParagraph({ page: pages[author], paragraphOwner: author, text: before[author], delayMs: 40 })));
  await expectConverged({ pages: Object.values(pages), isComplete: isBeforeComplete });
  const isAfterComplete = await reachesLength({ page: pages.ana, typed: Object.values(after) });

  const typingDuringRestart = Promise.all(
    AUTHORS.map((author) => typeInParagraph({ page: pages[author], paragraphOwner: author, text: after[author], delayMs: 250 })),
  );
  await pages.ana.waitForTimeout(300);
  const lengthBeforeRestart = (await pages.ana.evaluate(() => (window as any).poc.getText())).length;
  await stack.restartCollaboration(RESTART_DOWNTIME_MS);
  await typingDuringRestart;
  const markersByAuthor = Object.fromEntries(AUTHORS.map((author) => [author, before[author] + after[author]])) as Record<Author, string>;
  const clientText = await expectConverged({ pages: Object.values(pages), isComplete: isAfterComplete });
  await expectHistoryExact({ markersByAuthor, clientText });
  console.log('T7 caret anomalies:', countCaretAnomalies({ text: clientText, typed: [...Object.values(before), ...Object.values(after)] }));
  console.log('T7 focus recoveries:', JSON.stringify(focusRecoveries));
  console.log('T7 connections per author:', Object.fromEntries(stack.proxy.connectionsByUser), 'relayed updates:', countRelayedUpdates());
});
