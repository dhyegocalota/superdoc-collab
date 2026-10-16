import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';
import { readMainStoryText } from '../lib/document-content';
const database = new DatabaseSync(process.argv[2]);
const rows = database.prepare('SELECT state FROM snapshots ORDER BY sequence DESC LIMIT 1').all() as { state: Uint8Array }[];
const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const read: number[] = [], decode: number[] = [], text: number[] = [];
for (let i = 0; i < 15; i++) {
  let t = performance.now();
  const row = database.prepare('SELECT state FROM snapshots ORDER BY sequence DESC LIMIT 1').get() as { state: Uint8Array };
  read.push(performance.now() - t);
  t = performance.now();
  const doc = new Y.Doc(); Y.applyUpdate(doc, new Uint8Array(row.state));
  decode.push(performance.now() - t);
  t = performance.now(); readMainStoryText(doc); text.push(performance.now() - t);
}
console.log({ snapshots: rows.length, bytes: rows[0].state.byteLength, sqliteReadMs: +median(read).toFixed(2), yjsDecodeMs: +median(decode).toFixed(1), extractTextMs: +median(text).toFixed(1) });
