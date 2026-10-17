export function jsonResponse({ body, status, headers }: { body: unknown; status?: number; headers?: HeadersInit }): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
