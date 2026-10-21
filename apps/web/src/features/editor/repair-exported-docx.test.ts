import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { repairExportedDocx } from './repair-exported-docx';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WORD_DATE_UTC_NAMESPACE = 'http://schemas.microsoft.com/office/word/2023/wordml/word16du';
const DOCUMENT_ENTRY = 'word/document.xml';
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XML_MIME_TYPE = 'application/xml';
const PROLOG = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const DATE_UTC_BODY =
  '<w:body><w:p><w:ins w:id="0" w:author="Ana" w:date="2026-10-21T10:00:00Z" w16du:dateUtc="2026-10-21T13:00:00Z"><w:r><w:t>hi</w:t></w:r></w:ins></w:p></w:body>';

function documentXml({ declarations, body }: { declarations: string; body: string }): string {
  return `${PROLOG}<w:document xmlns:w="${WORD_NAMESPACE}"${declarations}>${body}</w:document>`;
}

async function packageOf(parts: Record<string, string>): Promise<Blob> {
  const zip = new JSZip();
  Object.entries(parts).forEach(([name, content]) => zip.file(name, content));
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME_TYPE });
}

async function partOf({ file, name }: { file: Blob; name: string }): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  return zip.file(name)!.async('string');
}

function parsesWithoutError(xml: string): boolean {
  const parsed = new DOMParser().parseFromString(xml, XML_MIME_TYPE);
  return parsed.getElementsByTagName('parsererror').length === 0;
}

test('a part that uses w16du:dateUtc without declaring it parses after the repair', async () => {
  const xml = documentXml({ declarations: '', body: DATE_UTC_BODY });
  expect(parsesWithoutError(xml)).toBe(false);

  const repaired = await repairExportedDocx(await packageOf({ [DOCUMENT_ENTRY]: xml }));

  const repairedXml = await partOf({ file: repaired, name: DOCUMENT_ENTRY });
  expect(parsesWithoutError(repairedXml)).toBe(true);
  expect(repairedXml).toContain(`xmlns:w16du="${WORD_DATE_UTC_NAMESPACE}"`);
});

test('the repaired file keeps the type of the exported one', async () => {
  const xml = documentXml({ declarations: '', body: DATE_UTC_BODY });
  const repaired = await repairExportedDocx(await packageOf({ [DOCUMENT_ENTRY]: xml }));
  expect(repaired.type).toBe(DOCX_MIME_TYPE);
});

test('an already well-formed export comes out with identical part contents', async () => {
  const declared = documentXml({
    declarations: ` xmlns:w16du="${WORD_DATE_UTC_NAMESPACE}"`,
    body: DATE_UTC_BODY,
  });
  const styles = `${PROLOG}<w:styles xmlns:w="${WORD_NAMESPACE}"><w:style w:styleId="Normal"/></w:styles>`;

  const repaired = await repairExportedDocx(await packageOf({ [DOCUMENT_ENTRY]: declared, 'word/styles.xml': styles }));

  expect(await partOf({ file: repaired, name: DOCUMENT_ENTRY })).toBe(declared);
  expect(await partOf({ file: repaired, name: 'word/styles.xml' })).toBe(styles);
});

test('a prefix declared on an inner element is not a missing declaration', async () => {
  const xml = documentXml({
    declarations: '',
    body: '<w:body><custom:note xmlns:custom="urn:custom">x</custom:note></w:body>',
  });
  const repaired = await repairExportedDocx(await packageOf({ [DOCUMENT_ENTRY]: xml }));
  expect(await partOf({ file: repaired, name: DOCUMENT_ENTRY })).toBe(xml);
});

test('a prefix inside an attribute value or a text node is not read as a prefix in use', async () => {
  const xml = documentXml({
    declarations: '',
    body: '<w:body><w:p w:note="see unknown:thing=1">a unknown:b=c</w:p></w:body>',
  });
  const repaired = await repairExportedDocx(await packageOf({ [DOCUMENT_ENTRY]: xml }));
  expect(await partOf({ file: repaired, name: DOCUMENT_ENTRY })).toBe(xml);
});

test('an unknown undeclared prefix throws instead of being dropped', async () => {
  const xml = documentXml({ declarations: '', body: '<w:body><mystery:node mystery:flag="1"/></w:body>' });
  await expect(repairExportedDocx(await packageOf({ [DOCUMENT_ENTRY]: xml }))).rejects.toThrow('mystery');
});

test('parts outside word/ are left alone', async () => {
  const content = '<root><mystery:node/></root>';
  const repaired = await repairExportedDocx(
    await packageOf({ [DOCUMENT_ENTRY]: documentXml({ declarations: '', body: '' }), 'docProps/app.xml': content }),
  );
  expect(await partOf({ file: repaired, name: 'docProps/app.xml' })).toBe(content);
});
