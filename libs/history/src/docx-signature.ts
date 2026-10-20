import { MAX_DOCUMENT_XML_BYTES } from '@superdoc-collab/types';
import JSZip from 'jszip';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const MAIN_DOCUMENT_ENTRY = 'word/document.xml';

export enum DocxVerdict {
  Accepted = 'accepted',
  NotADocx = 'not-a-docx',
  TooLarge = 'too-large',
}

type InflatedStream = {
  on(event: 'data', handler: (chunk: Uint8Array) => void): InflatedStream;
  on(event: 'end', handler: () => void): InflatedStream;
  on(event: 'error', handler: (error: Error) => void): InflatedStream;
  pause(): void;
  resume(): void;
};

type StreamingEntry = { internalStream: (type: 'uint8array') => InflatedStream };

function exceedsInflatedLimit(entry: JSZip.JSZipObject): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const inflated = { bytes: 0 };
    const stream = (entry as unknown as StreamingEntry).internalStream('uint8array');
    stream.on('data', (chunk) => {
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

export function declaredDocumentXmlBytes(bytes: Uint8Array): number {
  throw new Error('declaredDocumentXmlBytes is not implemented');
}

export async function isDocx(bytes: Uint8Array): Promise<boolean> {
  return (await inspectDocx(bytes)) === DocxVerdict.Accepted;
}
