import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { isDocx } from './docx-signature';
import { buildSeedDocx } from './seed-docx';

async function zipWith(entry: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(entry, 'x');
  return zip.generateAsync({ type: 'uint8array' });
}

test.each([
  ['a generated docx', () => buildSeedDocx([{ text: 'Hello', trackedChanges: [] }]), true],
  ['a zip without word/document.xml', () => zipWith('notes.txt'), false],
  ['bytes without the zip signature', async () => new TextEncoder().encode('%PDF-1.7'), false],
  ['a truncated zip', async () => (await zipWith('word/document.xml')).slice(0, 40), false],
])('isDocx: %s → %s', async (_, bytes, expected) => expect(await isDocx(await bytes())).toBe(expected));
