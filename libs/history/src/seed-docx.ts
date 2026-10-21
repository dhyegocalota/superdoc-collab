import JSZip from 'jszip';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WORD_DATE_UTC_NAMESPACE = 'http://schemas.microsoft.com/office/word/2023/wordml/word16du';
const COMMENTS_CONTENT_TYPE =
  '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>';
const COMMENTS_RELATIONSHIP =
  '<Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>';

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

export type SeedComment = {
  paragraph: number;
  author: string;
  date: string;
  text: string;
};

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function renderTrackedChange({ change, revisionId }: { change: SeedTrackedChange; revisionId: number }): string {
  const attributes = `w:id="${revisionId}" w:author="${escapeXml(change.author)}" w:date="${change.date}" w16du:dateUtc="${change.date}"`;
  if (change.kind === TrackedChangeKind.Insert) {
    return `<w:ins ${attributes}><w:r><w:t xml:space="preserve">${escapeXml(change.text)}</w:t></w:r></w:ins>`;
  }
  return `<w:del ${attributes}><w:r><w:delText xml:space="preserve">${escapeXml(change.text)}</w:delText></w:r></w:del>`;
}

function renderCommentedRun({ run, commentIds }: { run: string; commentIds: number[] }): string {
  const starts = commentIds.map((id) => `<w:commentRangeStart w:id="${id}"/>`).join('');
  const ends = commentIds.map((id) => `<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>`).join('');
  return `${starts}${run}${ends}`;
}

function renderComment({ comment, commentId }: { comment: SeedComment; commentId: number }): string {
  const attributes = `w:id="${commentId}" w:author="${escapeXml(comment.author)}" w:date="${comment.date}"`;
  return `<w:comment ${attributes}><w:p><w:r><w:t xml:space="preserve">${escapeXml(comment.text)}</w:t></w:r></w:p></w:comment>`;
}

export async function buildSeedDocx(paragraphs: SeedParagraph[], comments: SeedComment[] = []): Promise<Buffer> {
  let revisionId = 100;
  const body = paragraphs
    .map((paragraph, index) => {
      const trackedRuns = paragraph.trackedChanges.map((change) => renderTrackedChange({ change, revisionId: revisionId++ })).join('');
      const commentIds = comments.flatMap((comment, commentId) => (comment.paragraph === index ? [commentId] : []));
      const textRun = renderCommentedRun({ run: `<w:r><w:t xml:space="preserve">${escapeXml(paragraph.text)}</w:t></w:r>`, commentIds });
      return `<w:p>${textRun}${trackedRuns}</w:p>`;
    })
    .join('');
  const hasComments = comments.length > 0;
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${WORD_NAMESPACE}" xmlns:w16du="${WORD_DATE_UTC_NAMESPACE}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      (hasComments ? COMMENTS_CONTENT_TYPE : '') +
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
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      (hasComments ? COMMENTS_RELATIONSHIP : '') +
      '</Relationships>',
  );
  zip.file('word/document.xml', documentXml);
  if (hasComments) {
    const commentsXml = comments.map((comment, commentId) => renderComment({ comment, commentId })).join('');
    zip.file(
      'word/comments.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + `<w:comments xmlns:w="${WORD_NAMESPACE}">${commentsXml}</w:comments>`,
    );
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}

export async function readDocumentXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file('word/document.xml')!.async('string');
}
