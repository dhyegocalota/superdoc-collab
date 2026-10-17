import { crc32 } from 'node:zlib';

const PARAGRAPH_COUNT = 56_800;
const FILLER_SENTENCE = 'The quick brown fox jumps over the lazy dog while the committee reviews every clause of the agreement again.';
const ZIP_VERSION = 20;
const ZIP_DOS_DATE = 33;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const PACKAGE_RELATIONSHIPS_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_DOCUMENT_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

type ZipEntry = { name: string; data: Buffer };

function storedZip(entries: ZipEntry[]): Buffer {
  const localParts = entries.map(({ name, data }) => {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(ZIP_LOCAL_SIGNATURE, 0);
    header.writeUInt16LE(ZIP_VERSION, 4);
    header.writeUInt16LE(ZIP_DOS_DATE, 12);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(Buffer.byteLength(name), 26);
    return Buffer.concat([header, Buffer.from(name), data]);
  });
  const offsets = localParts.map((_, index) => localParts.slice(0, index).reduce((sum, part) => sum + part.length, 0));
  const centralParts = entries.map(({ name, data }, index) => {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0);
    header.writeUInt16LE(ZIP_VERSION, 4);
    header.writeUInt16LE(ZIP_VERSION, 6);
    header.writeUInt16LE(ZIP_DOS_DATE, 14);
    header.writeUInt32LE(crc32(data), 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(Buffer.byteLength(name), 28);
    header.writeUInt32LE(offsets[index]!, 42);
    return Buffer.concat([header, Buffer.from(name)]);
  });
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(ZIP_END_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(
    localParts.reduce((sum, part) => sum + part.length, 0),
    16,
  );
  return Buffer.concat([...localParts, central, end]);
}

function paragraphXml(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

export function buildLargeDocx(firstParagraph: string): Buffer {
  const paragraphs = Array.from({ length: PARAGRAPH_COUNT }, (_, index) => paragraphXml(`Clause ${index + 1}. ${FILLER_SENTENCE}`));
  const documentXml = `${XML_HEADER}<w:document xmlns:w="${WORD_NAMESPACE}"><w:body>${paragraphXml(firstParagraph)}${paragraphs.join('')}<w:sectPr/></w:body></w:document>`;
  return storedZip([
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NAMESPACE}">` +
          `<Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="word/document.xml"/></Relationships>`,
      ),
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: Buffer.from(`${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NAMESPACE}"/>`),
    },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
  ]);
}
