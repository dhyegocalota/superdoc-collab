import { SuperDocClient } from '@superdoc/sdk';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildSeedDocx } from '../../lib/seed-docx';

const WORD_REVISIONS = [
  { kind: 'insert' as const, author: 'Chris Crawford', date: '2026-02-12T09:01:00Z', text: ' developers' },
  { kind: 'delete' as const, author: 'Default SuperDoc user', date: '2026-02-11T14:10:00Z', text: ' legacy' },
  { kind: 'insert' as const, author: 'Ana Souza', date: '2026-03-01T18:30:00Z', text: ' GDPR clause' },
];

let client: SuperDocClient;
let docxPath: string;

beforeAll(async () => {
  docxPath = join(mkdtempSync(join(tmpdir(), 'poc-t10-')), 'word-revisions.docx');
  writeFileSync(
    docxPath,
    await buildSeedDocx([
      { text: 'Preamble by', trackedChanges: [WORD_REVISIONS[0], WORD_REVISIONS[1]] },
      { text: 'Data processing terms.', trackedChanges: [WORD_REVISIONS[2]] },
    ]),
  );
  client = new SuperDocClient();
  await client.connect();
});

afterAll(async () => client.dispose());

type ListedTrackedChange = {
  id: string;
  type: 'insertion' | 'deletion';
  author: string;
  date: string;
  insertedText: string | null;
  deletedText: string | null;
  imported: boolean;
  navigationTarget: { blockId: string };
};

test('T10: Node SDK lists Word tracked changes with author, date and text', async () => {
  const document = await client.open({ doc: docxPath });
  const listed = (await document.trackChanges.list({})) as unknown as { items: ListedTrackedChange[] };
  await document.close({ discard: true });

  const normalized = listed.items.map((item) => ({
    kind: item.type === 'insertion' ? 'insert' : 'delete',
    author: item.author,
    date: item.date,
    text: item.type === 'insertion' ? item.insertedText : item.deletedText,
  }));
  expect(normalized).toEqual(WORD_REVISIONS);
  expect(listed.items.every((item) => item.imported)).toBe(true);
  expect(listed.items.map((item) => item.navigationTarget.blockId)).toEqual(['00000001', '00000001', '00000002']);
});
