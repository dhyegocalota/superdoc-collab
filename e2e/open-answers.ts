import type { Page } from '@playwright/test';
import { documentApiPath, HttpMethod, HttpStatus, type BootstrapProgress, type OpenedDocument } from '../libs/types/src';

const ANY_DOCUMENT_OPEN_PATH = /\/api\/documents\/[^/?#]+(\?[^#]*)?$/;

async function scriptRoute({
  page,
  matcher,
  bootstraps,
}: {
  page: Page;
  matcher: string | RegExp;
  bootstraps: BootstrapProgress[];
}): Promise<void> {
  const remaining = [...bootstraps];
  await page.route(matcher, async (route) => {
    if (route.request().method() !== HttpMethod.Get) return route.fallback();
    const scripted = remaining.shift();
    const real = await route.fetch();
    const body = (await real.json()) as OpenedDocument;
    if (scripted) return route.fulfill({ status: HttpStatus.Ok, json: { ...body, bootstrap: scripted } });
    return route.fulfill({ response: real });
  });
}

export function scriptOpenAnswers({
  page,
  documentId,
  bootstraps,
}: {
  page: Page;
  documentId: string;
  bootstraps: BootstrapProgress[];
}): Promise<void> {
  return scriptRoute({ page, matcher: `**${documentApiPath({ documentId })}*`, bootstraps });
}

export function scriptNextOpenAnswers({ page, bootstraps }: { page: Page; bootstraps: BootstrapProgress[] }): Promise<void> {
  return scriptRoute({ page, matcher: ANY_DOCUMENT_OPEN_PATH, bootstraps });
}
