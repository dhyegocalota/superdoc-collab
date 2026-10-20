import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { MAX_DOCUMENT_XML_BYTES } from '@superdoc-collab/types';
import { declaredDocumentXmlBytes, DocxVerdict, inspectDocx, isDocx } from './docx-signature';
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

const XML_BYTES = 3_000_000;
const CENTRAL_ENTRY_SIGNATURE = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const CENTRAL_UNCOMPRESSED_SIZE_OFFSET = 24;

test('the declared size of document.xml is its inflated size, however small the deflated file is', async () => {
  const deflated = await zipWithDocumentXml(new Uint8Array(XML_BYTES));
  expect(deflated.byteLength).toBeLessThan(XML_BYTES / 100);
  expect(declaredDocumentXmlBytes(deflated)).toBe(XML_BYTES);
  expect(declaredDocumentXmlBytes(await buildSeedDocx([{ text: 'Hello', trackedChanges: [] }]))).toBeGreaterThan(0);
});

test('a zip that declares a smaller document.xml than it inflates to is not an accepted docx', async () => {
  const liar = Buffer.from(await zipWithDocumentXml(new Uint8Array(XML_BYTES)));
  liar.writeUInt32LE(1, liar.indexOf(CENTRAL_ENTRY_SIGNATURE) + CENTRAL_UNCOMPRESSED_SIZE_OFFSET);
  expect(await inspectDocx(liar)).toBe(DocxVerdict.NotADocx);
});
