import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Hono } from 'hono';

const INDEX_FILE = 'index.html';
const API_PREFIX = '/api';

export function mountStaticWeb({ app, webDistDirectory, appOrigin }: { app: Hono; webDistDirectory: string; appOrigin: string }): void {
  const indexHtml = readFileSync(join(webDistDirectory, INDEX_FILE), 'utf8');
  app.use('*', serveStatic({ root: webDistDirectory }));
  app.get('*', async (context, next) => {
    if (context.req.path.startsWith(API_PREFIX)) return next();
    return context.html(indexHtml);
  });
}
