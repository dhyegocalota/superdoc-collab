import { ApiPath, HttpMethod, DOCX_MIME_TYPE, PREPARATION_FIELD, UPLOAD_FIELD, type DocumentsList } from '@superdoc-collab/types';
import JSZip from 'jszip';
import type { TestServer } from './test-server';

const JSON_HEADERS = { 'content-type': 'application/json' };

export async function upload({
  server,
  cookie,
  bytes,
  type = DOCX_MIME_TYPE,
  fileName = 'Plan.docx',
  preparation,
}: {
  server: TestServer;
  cookie: string;
  bytes: Uint8Array;
  type?: string;
  fileName?: string;
  preparation?: string;
}): Promise<Response> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, new File([new Uint8Array(bytes)], fileName, { type }));
  if (preparation !== undefined) form.set(PREPARATION_FIELD, preparation);
  return fetch(`${server.baseUrl}${ApiPath.Documents}`, {
    method: HttpMethod.Post,
    headers: { cookie, origin: server.baseUrl },
    body: form,
  });
}

export async function listOf({ server, cookie }: { server: TestServer; cookie: string }): Promise<DocumentsList> {
  return (await fetch(`${server.baseUrl}${ApiPath.Documents}`, { headers: { cookie } })).json();
}

export async function createBlank({ server, cookie, title }: { server: TestServer; cookie: string; title: string }): Promise<Response> {
  return fetch(`${server.baseUrl}${ApiPath.Documents}`, {
    method: HttpMethod.Post,
    headers: { cookie, ...JSON_HEADERS },
    body: JSON.stringify({ title }),
  });
}

export async function docxWithXmlBytes(xmlBytes: number): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('word/document.xml', new Uint8Array(xmlBytes), { compression: 'DEFLATE' });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
