import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { UpdateLog, materialize } from '../lib/update-log';

const source = process.argv[2];
const probe = new UpdateLog(source);
const documentName = (probe as any).database.prepare('SELECT document_name FROM updates LIMIT 1').get().document_name;
const all = probe.read({ documentName, untilSequence: Number.MAX_SAFE_INTEGER });
probe.close();
const logBytes = all.reduce((sum, u) => sum + u.update.byteLength, 0);
console.log({ updates: all.length, logMB: +(logBytes / 1e6).toFixed(2) });

function now() { return performance.now(); }
for (const every of [1000, 500, 250, 100]) {
  const path = join(mkdtempSync(join(tmpdir(), 'bench-')), 'h.sqlite');
  copyFileSync(source, path);
  const log = new UpdateLog(path);
  (log as any).database.exec('DELETE FROM snapshots');
  const boundaries = all.filter((_, i) => (i + 1) % every === 0).map((u) => u.sequence);
  const perSnapshotMs: number[] = [];
  let snapshotBytes = 0;
  let lastState = 0;
  boundaries.forEach((sequence) => {
    const t = now();
    const state = Y.encodeStateAsUpdate(materialize({ log, documentName, untilSequence: sequence }));
    log.writeSnapshot({ documentName, sequence, state });
    perSnapshotMs.push(now() - t);
    snapshotBytes += state.byteLength;
    lastState = state.byteLength;
  });
  const worstSequences = boundaries.map((b) => b - 1).concat(all.at(-1)!.sequence);
  const loadMs = worstSequences.map((sequence) => { const t = now(); materialize({ log, documentName, untilSequence: sequence }); return now() - t; });
  const sorted = [...loadMs].sort((a, b) => a - b);
  log.close();
  console.log({
    every,
    snapshots: boundaries.length,
    snapshotStorageMB: +(snapshotBytes / 1e6).toFixed(2),
    lastSnapshotKB: Math.round(lastState / 1e3),
    perSnapshotMsMax: +Math.max(...perSnapshotMs).toFixed(1),
    worstCaseLoadMsP50: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
    worstCaseLoadMsMax: +sorted.at(-1)!.toFixed(1),
  });
}
