import JSZip from 'jszip';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const MAIN_DOCUMENT_ENTRY = 'word/document.xml';

export enum DocxVerdict {
  Accepted = 'accepted',
  NotADocx = 'not-a-docx',
  TooLarge = 'too-large',
}

export async function inspectDocx(bytes: Uint8Array): Promise<DocxVerdict> {
  throw new Error(`inspectDocx is not implemented ${bytes.byteLength}`);
}

export async function isDocx(bytes: Uint8Array): Promise<boolean> {
  const hasZipSignature = ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
  if (!hasZipSignature) return false;
  try {
    const zip = await JSZip.loadAsync(bytes);
    return zip.file(MAIN_DOCUMENT_ENTRY) !== null;
  } catch {
    return false;
  }
}
