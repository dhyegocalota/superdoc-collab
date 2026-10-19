import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { expect, test } from 'vitest';
import { mountStaticWeb } from './static-web';

const APP_ORIGIN = 'https://collab.example.com';
const IMAGE_PATH = '/og-image.png';
const INDEX_HTML = `<html><head>
<meta property="og:image" content="${IMAGE_PATH}" />
<meta name="twitter:image" content="${IMAGE_PATH}" />
<link rel="icon" href="/favicon.svg" />
</head><body>app</body></html>`;

function mountedApp(): Hono {
  const webDistDirectory = mkdtempSync(join(tmpdir(), 'static-web-'));
  writeFileSync(join(webDistDirectory, 'index.html'), INDEX_HTML);
  const app = new Hono();
  mountStaticWeb({ app, webDistDirectory, appOrigin: APP_ORIGIN });
  return app;
}

test('the served index.html carries absolute og:image and twitter:image URLs', async () => {
  const html = await (await mountedApp().request('/documents/any')).text();
  expect(html).toContain(`<meta property="og:image" content="${APP_ORIGIN}${IMAGE_PATH}" />`);
  expect(html).toContain(`<meta name="twitter:image" content="${APP_ORIGIN}${IMAGE_PATH}" />`);
});

test('other root-relative URLs in index.html stay as they are', async () => {
  const html = await (await mountedApp().request('/')).text();
  expect(html).toContain('<link rel="icon" href="/favicon.svg" />');
});

test.each(['/', '/index.html'])('%s serves the rewritten index.html, not the file on disk', async (path) => {
  const html = await (await mountedApp().request(path)).text();
  expect(html).toContain(`<meta property="og:image" content="${APP_ORIGIN}${IMAGE_PATH}" />`);
  expect(html).toContain(`<meta name="twitter:image" content="${APP_ORIGIN}${IMAGE_PATH}" />`);
});
