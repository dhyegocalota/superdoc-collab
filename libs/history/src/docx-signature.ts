import JSZip from 'jszip';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const MAIN_DOCUMENT_ENTRY = 'word/document.xml';

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
