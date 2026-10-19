import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Hono } from 'hono';

const INDEX_FILE = 'index.html';
const API_PREFIX = '/api';
const INDEX_PATHS = ['/', `/${INDEX_FILE}`];
const SHARE_IMAGE_PATH = '/og-image.png';
const SHARE_IMAGE_CONTENT_PATTERN = new RegExp(`(<meta [^>]*(?:og|twitter):image"[^>]*content=")${SHARE_IMAGE_PATH}(")`, 'g');

function withAbsoluteShareImage({ html, appOrigin }: { html: string; appOrigin: string }): string {
  return html.replace(SHARE_IMAGE_CONTENT_PATTERN, `$1${appOrigin}${SHARE_IMAGE_PATH}$2`);
}

export function mountStaticWeb({ app, webDistDirectory, appOrigin }: { app: Hono; webDistDirectory: string; appOrigin: string }): void {
  const indexHtml = withAbsoluteShareImage({ html: readFileSync(join(webDistDirectory, INDEX_FILE), 'utf8'), appOrigin });
  INDEX_PATHS.forEach((path) => app.get(path, (context) => context.html(indexHtml)));
  app.use('*', serveStatic({ root: webDistDirectory }));
  app.get('*', async (context, next) => {
    if (context.req.path.startsWith(API_PREFIX)) return next();
    return context.html(indexHtml);
  });
}
