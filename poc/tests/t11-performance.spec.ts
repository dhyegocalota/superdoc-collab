import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { readEditEvents } from '../lib/document-history';
import { groupIntoWindows } from '../lib/edit-windows';
import { buildSeedDocx } from '../lib/seed-docx';
import { SingleFlight } from '../lib/single-flight';
import { UpdateLog, compact, materialize, replay } from '../lib/update-log';
import { AUTHORS, expectConverged, insertedTextBy, openAuthors, reachesLength, startStack, typeInParagraph, type Stack } from './harness';

const FILLER_PARAGRAPHS = 200;
const FILLER_TEXT = 'This clause describes obligations, liabilities and service levels between the parties. ';
const CHARACTERS_PER_AUTHOR = 400;
const KEYSTROKE_DELAY_MS = 15;
const SNAPSHOT_REPLAY_BUDGET_MS = 300;
const SNAPSHOT_EVERY_UPDATES = 1000;
const CONCURRENT_REQUESTS = 50;
const RULES = { idleGapMs: 1500, maxWindowMs: 60_000, coEditGapMs: 800 };

let stack: Stack;
test.afterEach(async () => stack.stop());

function timed<Value>(compute: () => Value): { value: Value; elapsedMs: number } {
  const startedAt = performance.now();
  const value = compute();
  return { value, elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10 };
}

function percentile({ values, ratio }: { values: number[]; ratio: number }): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

test('T11 + H6 + T12: large document, heavy concurrent typing, measured', async ({ browser }) => {
  const seedDocx = await buildSeedDocx([
    ...AUTHORS.map((author) => ({ text: `Paragraph owned by ${author}.`, trackedChanges: [] })),
    ...Array.from({ length: FILLER_PARAGRAPHS }, (_, index) => ({ text: `${index}. ${FILLER_TEXT.repeat(3)}`, trackedChanges: [] })),
  ]);
  stack = await startStack('t11-performance');
  const pages = await openAuthors({ browser, target: stack, seedDocx });
  const typedByAuthor = Object.fromEntries(AUTHORS.map((author) => [author, ` ${author}:` + 'x'.repeat(CHARACTERS_PER_AUTHOR - author.length - 2)]));

  const isComplete = await reachesLength({ page: pages.ana, typed: Object.values(typedByAuthor) });
  await Promise.all(AUTHORS.map((author) => typeInParagraph({ page: pages[author], paragraphOwner: author, text: typedByAuthor[author], delayMs: KEYSTROKE_DELAY_MS })));
  await expectConverged({ pages: Object.values(pages), isComplete });

  const log = stack.collaboration.log;
  const updates = log.read({ documentName: stack.roomName, untilSequence: Number.MAX_SAFE_INTEGER });
  const keystrokes = AUTHORS.length * CHARACTERS_PER_AUTHOR;
  const sizes = updates.map((update) => update.update.byteLength);
  const totalBytes = sizes.reduce((sum, size) => sum + size, 0);

  const replayRun = timed(() => replay(updates));
  const compactionRun = timed(() => compact({ log, documentName: stack.roomName, everyUpdates: SNAPSHOT_EVERY_UPDATES }));
  const lastSequence = updates.at(-1)!.sequence;
  const snapshotReplayRun = timed(() => materialize({ log, documentName: stack.roomName, untilSequence: lastSequence }));
  const projectionRun = timed(() => readEditEvents({ log, documentName: stack.roomName }));
  const windowsRun = timed(() => groupIntoWindows({ events: projectionRun.value, rules: RULES }));

  const appendLog = new UpdateLog(join(mkdtempSync(join(tmpdir(), 'poc-append-')), 'append.sqlite'));
  const appendRun = timed(() => updates.forEach((update) => appendLog.append({ documentName: 'bench', connectionUserId: update.connectionUserId, update: update.update })));
  appendLog.close();

  const report = {
    updates: updates.length,
    keystrokes,
    updatesPerKeystroke: Math.round((updates.length / keystrokes) * 100) / 100,
    totalBytes,
    bytesPerKeystroke: Math.round(totalBytes / keystrokes),
    updateBytesP50: percentile({ values: sizes, ratio: 0.5 }),
    updateBytesP95: percentile({ values: sizes, ratio: 0.95 }),
    updateBytesMax: Math.max(...sizes),
    compactedStateBytes: Y.encodeStateAsUpdate(replayRun.value).byteLength,
    fullReplayMs: replayRun.elapsedMs,
    compactionMs: compactionRun.elapsedMs,
    snapshotReplayMs: snapshotReplayRun.elapsedMs,
    projectionMs: projectionRun.elapsedMs,
    projectionMsPerUpdate: Math.round((projectionRun.elapsedMs / updates.length) * 1000) / 1000,
    windowsMs: windowsRun.elapsedMs,
    appendMs: appendRun.elapsedMs,
    appendPerSecond: Math.round(updates.length / (appendRun.elapsedMs / 1000)),
    events: projectionRun.value.length,
    windows: windowsRun.value.length,
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/performance.json', JSON.stringify(report, null, 2));
  console.log('T11 report', report);
  expect(report.updates).toBeGreaterThanOrEqual(5000);
  AUTHORS.forEach((author) => expect(insertedTextBy({ events: projectionRun.value, author })).toBe(typedByAuthor[author]));
  expect(report.snapshotReplayMs).toBeLessThan(SNAPSHOT_REPLAY_BUDGET_MS);
  expect(Y.encodeStateVector(snapshotReplayRun.value)).toEqual(Y.encodeStateVector(replayRun.value));

  const reopened = new UpdateLog(stack.databasePath);
  const reprojected = readEditEvents({ log: reopened, documentName: stack.roomName });
  reopened.close();
  expect(reprojected).toEqual(projectionRun.value);
  expect(groupIntoWindows({ events: reprojected, rules: RULES })).toEqual(windowsRun.value);

  const singleFlight = new SingleFlight<ReturnType<typeof readEditEvents>>();
  const results = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, () =>
      singleFlight.run({ key: `${stack.roomName}:0-${lastSequence}`, compute: async () => readEditEvents({ log, documentName: stack.roomName }) }),
    ),
  );
  expect(singleFlight.computations).toBe(1);
  expect(results.every((result) => result === results[0])).toBe(true);
});
