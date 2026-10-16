import { expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMainStoryText } from '../lib/document-content';
import { readEditEvents } from '../lib/document-history';
import { resolveAuthorIds } from '../lib/edit-events';
import { UpdateLog, replay } from '../lib/update-log';
import { ChaosProxy } from '../server/chaos-proxy';
import { AUTHORS, expectConverged, expectEveryCharacterAccounted, insertedTextBy, markerOf, openAuthors, reachesLength, readClientText, typeInParagraph } from './harness';
import { ServerProcess } from './server-process';

const CRASH_AFTER_MS = 700;
const CRASH_DOWNTIME_MS = 2500;
const CRASH_ROUNDS = 3;

test('E10: the server is SIGKILLed mid-typing several times; history stays exact', async ({ browser }) => {
  const collaborationPort = 31_000 + (process.pid % 500) * 2;
  const proxyPort = collaborationPort + 1;
  const databasePath = join(mkdtempSync(join(tmpdir(), 'poc-crash-')), 'history.sqlite');
  const documentId = 'e10-hard-crash';
  const roomName = `sd2/v2.1/${documentId}`;
  const server = new ServerProcess({ port: collaborationPort, databasePath });
  const proxy = new ChaosProxy({ listenPort: proxyPort, targetUrl: `ws://127.0.0.1:${collaborationPort}` });
  await server.start();
  await proxy.listen();

  try {
    const pages = await openAuthors({ browser, target: { documentId, proxyPort } });
    const initialLength = (await readClientText(pages.ana)).length;
    const markers = Object.fromEntries(
      AUTHORS.map((author) => [author, Array.from({ length: CRASH_ROUNDS }, (_, round) => markerOf({ author, tag: `K${round}` })).join('')]),
    );
    const isComplete = await reachesLength({ page: pages.ana, typed: Object.values(markers) });

    for (let round = 0; round < CRASH_ROUNDS; round++) {
      const typing = Promise.all(
        AUTHORS.map((author) => typeInParagraph({ page: pages[author], paragraphOwner: author, text: markerOf({ author, tag: `K${round}` }), delayMs: 120 })),
      );
      await pages.ana.waitForTimeout(CRASH_AFTER_MS);
      await server.kill('SIGKILL');
      await pages.ana.waitForTimeout(CRASH_DOWNTIME_MS);
      await server.start();
      await typing;
    }

    const clientText = await expectConverged({ pages: Object.values(pages), isComplete });
    await expect
      .poll(
        () => {
          const log = new UpdateLog(databasePath);
          const text = readMainStoryText(replay(log.read({ documentName: roomName, untilSequence: Number.MAX_SAFE_INTEGER })));
          log.close();
          return text;
        },
        { timeout: 60_000 },
      )
      .toBe(clientText);

    const log = new UpdateLog(databasePath);
    const events = readEditEvents({ log, documentName: roomName });
    const identities = log.clientIdentities(roomName);
    const updates = log.read({ documentName: roomName, untilSequence: Number.MAX_SAFE_INTEGER });
    const relayed = updates.filter((update) => resolveAuthorIds({ update, identities }).some((authorId) => authorId !== update.connectionUserId));
    log.close();

    expectEveryCharacterAccounted({ events, initialLength, finalLength: clientText.length });
    AUTHORS.forEach((author) => expect(insertedTextBy({ events, author })).toBe(markers[author]));
    console.log('E10 relayed updates after crashes:', relayed.length, 'connections:', Object.fromEntries(proxy.connectionsByUser));
  } finally {
    await proxy.close();
    await server.kill('SIGTERM').catch(() => undefined);
  }
});
