import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { MAX_DOCUMENT_XML_BYTES } from '@superdoc-collab/types';
import { DocxVerdict, inspectDocx, isDocx } from './docx-signature';
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

async function zipWithDocumentXml(documentXml: Uint8Array): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml, { compression: 'DEFLATE' });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

test.each([
  ['a generated docx', () => buildSeedDocx([{ text: 'Hello', trackedChanges: [] }]), DocxVerdict.Accepted],
  ['a zip without word/document.xml', () => zipWith('notes.txt'), DocxVerdict.NotADocx],
  ['bytes without the zip signature', async () => new TextEncoder().encode('%PDF-1.7'), DocxVerdict.NotADocx],
  [
    'a document.xml of exactly the limit once inflated',
    () => zipWithDocumentXml(new Uint8Array(MAX_DOCUMENT_XML_BYTES)),
    DocxVerdict.Accepted,
  ],
  [
    'a document.xml one byte over the limit once inflated',
    () => zipWithDocumentXml(new Uint8Array(MAX_DOCUMENT_XML_BYTES + 1)),
    DocxVerdict.TooLarge,
  ],
])('inspectDocx: %s → %s', async (_, bytes, expected) => expect(await inspectDocx(await bytes())).toBe(expected));

test('a document.xml over the inflated limit is not an accepted docx', async () => {
  expect(await isDocx(await zipWithDocumentXml(new Uint8Array(MAX_DOCUMENT_XML_BYTES + 1)))).toBe(false);
});
