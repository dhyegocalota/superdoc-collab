import { MAX_DOCUMENT_XML_BYTES } from '@superdoc-collab/types';
import JSZip from 'jszip';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const MAIN_DOCUMENT_ENTRY = 'word/document.xml';

export enum DocxVerdict {
  Accepted = 'accepted',
  NotADocx = 'not-a-docx',
  TooLarge = 'too-large',
}

function exceedsInflatedLimit(entry: JSZip.JSZipObject): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const inflated = { bytes: 0 };
    const stream = entry.nodeStream('nodebuffer');
    stream.on('data', (chunk: Buffer) => {
      inflated.bytes += chunk.length;
      if (inflated.bytes <= MAX_DOCUMENT_XML_BYTES) return;
      stream.pause();
      resolve(true);
    });
    stream.on('end', () => resolve(false));
    stream.on('error', reject);
    stream.resume();
  });
}

export async function inspectDocx(bytes: Uint8Array): Promise<DocxVerdict> {
  const hasZipSignature = ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
  if (!hasZipSignature) return DocxVerdict.NotADocx;
  try {
    const entry = (await JSZip.loadAsync(bytes)).file(MAIN_DOCUMENT_ENTRY);
    if (entry === null) return DocxVerdict.NotADocx;
    if (await exceedsInflatedLimit(entry)) return DocxVerdict.TooLarge;
    return DocxVerdict.Accepted;
  } catch {
    return DocxVerdict.NotADocx;
  }
}

export async function isDocx(bytes: Uint8Array): Promise<boolean> {
  return (await inspectDocx(bytes)) === DocxVerdict.Accepted;
}
