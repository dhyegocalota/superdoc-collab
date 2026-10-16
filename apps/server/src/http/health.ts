import type { Context } from 'hono';

export function health(context: Context): Response {
  return context.json({ status: 'ok' });
}
