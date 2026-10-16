import JSZip from 'jszip';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export enum TrackedChangeKind {
  Insert = 'insert',
  Delete = 'delete',
}

export type SeedTrackedChange = {
  kind: TrackedChangeKind;
  author: string;
  date: string;
  text: string;
};

export type SeedParagraph = {
  text: string;
  trackedChanges: SeedTrackedChange[];
};

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function renderTrackedChange({ change, revisionId }: { change: SeedTrackedChange; revisionId: number }): string {
  const attributes = `w:id="${revisionId}" w:author="${escapeXml(change.author)}" w:date="${change.date}"`;
  if (change.kind === TrackedChangeKind.Insert) {
    return `<w:ins ${attributes}><w:r><w:t xml:space="preserve">${escapeXml(change.text)}</w:t></w:r></w:ins>`;
  }
  return `<w:del ${attributes}><w:r><w:delText xml:space="preserve">${escapeXml(change.text)}</w:delText></w:r></w:del>`;
}

export async function buildSeedDocx(paragraphs: SeedParagraph[]): Promise<Buffer> {
  let revisionId = 100;
  const body = paragraphs
    .map((paragraph) => {
      const trackedRuns = paragraph.trackedChanges
        .map((change) => renderTrackedChange({ change, revisionId: revisionId++ }))
        .join('');
      return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(paragraph.text)}</w:t></w:r>${trackedRuns}</w:p>`;
    })
    .join('');
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${WORD_NAMESPACE}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  );
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}
