import { MAX_DOCUMENT_XML_BYTES } from '@superdoc-collab/types';
import JSZip from 'jszip';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const MAIN_DOCUMENT_ENTRY = 'word/document.xml';
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const END_ENTRY_COUNT_OFFSET = 10;
const END_CENTRAL_DIRECTORY_OFFSET = 16;
const CENTRAL_ENTRY_HEADER_BYTES = 46;
const CENTRAL_UNCOMPRESSED_SIZE_OFFSET = 24;
const CENTRAL_NAME_LENGTH_OFFSET = 28;
const CENTRAL_EXTRA_LENGTH_OFFSET = 30;
const CENTRAL_COMMENT_LENGTH_OFFSET = 32;

export class DocumentXmlMissingError extends Error {
  constructor() {
    super(`The package has no ${MAIN_DOCUMENT_ENTRY}.`);
  }
}

type CentralDirectoryCursor = { offset: number; size: number | null };

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

function inflatedBytesOf(entry: JSZip.JSZipObject): Promise<number> {
  return new Promise((resolve, reject) => {
    const inflated = { bytes: 0 };
    const stream = (entry as unknown as StreamingEntry).internalStream('uint8array');
    stream.on('data', (chunk) => {
      inflated.bytes += chunk.length;
      if (inflated.bytes <= MAX_DOCUMENT_XML_BYTES) return;
      stream.pause();
      resolve(inflated.bytes);
    });
    stream.on('end', () => resolve(inflated.bytes));
    stream.on('error', reject);
    stream.resume();
  });
}

export function declaredDocumentXmlBytes(bytes: Uint8Array): number {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = buffer.lastIndexOf(END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  if (endOffset < 0) throw new DocumentXmlMissingError();
  const entryCount = buffer.readUInt16LE(endOffset + END_ENTRY_COUNT_OFFSET);
  const firstEntry: CentralDirectoryCursor = { offset: buffer.readUInt32LE(endOffset + END_CENTRAL_DIRECTORY_OFFSET), size: null };
  const found = Array.from({ length: entryCount }).reduce<CentralDirectoryCursor>((cursor) => {
    if (cursor.size !== null) return cursor;
    const nameLength = buffer.readUInt16LE(cursor.offset + CENTRAL_NAME_LENGTH_OFFSET);
    const trailingLength =
      buffer.readUInt16LE(cursor.offset + CENTRAL_EXTRA_LENGTH_OFFSET) + buffer.readUInt16LE(cursor.offset + CENTRAL_COMMENT_LENGTH_OFFSET);
    const nameStart = cursor.offset + CENTRAL_ENTRY_HEADER_BYTES;
    const name = buffer.toString('utf8', nameStart, nameStart + nameLength);
    const offset = nameStart + nameLength + trailingLength;
    if (name !== MAIN_DOCUMENT_ENTRY) return { offset, size: null };
    return { offset, size: buffer.readUInt32LE(cursor.offset + CENTRAL_UNCOMPRESSED_SIZE_OFFSET) };
  }, firstEntry);
  if (found.size === null) throw new DocumentXmlMissingError();
  return found.size;
}

export async function inspectDocx(bytes: Uint8Array): Promise<DocxVerdict> {
  const hasZipSignature = ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
  if (!hasZipSignature) return DocxVerdict.NotADocx;
  try {
    const entry = (await JSZip.loadAsync(bytes)).file(MAIN_DOCUMENT_ENTRY);
    if (entry === null) return DocxVerdict.NotADocx;
    const inflatedBytes = await inflatedBytesOf(entry);
    if (inflatedBytes > MAX_DOCUMENT_XML_BYTES) return DocxVerdict.TooLarge;
    if (inflatedBytes !== declaredDocumentXmlBytes(bytes)) return DocxVerdict.NotADocx;
    return DocxVerdict.Accepted;
  } catch {
    return DocxVerdict.NotADocx;
  }
}

export async function isDocx(bytes: Uint8Array): Promise<boolean> {
  return (await inspectDocx(bytes)) === DocxVerdict.Accepted;
}
