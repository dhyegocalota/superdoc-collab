import type { Browser, Page } from '@playwright/test';
import { AppRoute, DEMO_USERS, SECOND_MS, ShareLinkRole } from '../libs/types/src';
import { insertInParagraph, readEditorText, readEvents, shareAndAccept, uploadSeed } from './editor';
import { DEMO_PASSWORD, expect, signedInContext, signIn, test, type SignedInContext } from './fixtures';
import { ensureServerRunning, startRestartableStack, startServer, stopRestartableStack, stopServer } from './restartable-stack';
import { SERVER_HEALTH_PATH } from './stack';

const [ana, bruno] = DEMO_USERS;
const PROVIDER_RETRY_CAP_MS = 30 * SECOND_MS;
const MEMBERS_REFRESH_MS = 5 * SECOND_MS;
const RECOVERED_NOTICE_MS = 3 * SECOND_MS;
const LOST_TIMEOUT_MS = PROVIDER_RETRY_CAP_MS;
const RECOVERY_TIMEOUT_MS = PROVIDER_RETRY_CAP_MS + MEMBERS_REFRESH_MS + RECOVERED_NOTICE_MS + 10 * SECOND_MS;
const FAILED_TIMEOUT_MS = 2 * PROVIDER_RETRY_CAP_MS;
const CONVERGENCE_TIMEOUT_MS = 2 * PROVIDER_RETRY_CAP_MS;
const WIDTH_TEST_TIMEOUT_MS = 240 * SECOND_MS;
const VIEWPORT_HEIGHT = 900;
const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1280, 1536, 1920, 2560];
const MAX_BANNER_LINES = 3;
const BANNER_TEST_ID = 'connection-banner';
const EDITOR_TEST_ID = 'document-editor';
const STATE_ATTRIBUTE = 'data-state';
const ONLINE_STATE = 'online';
const OBSERVED_STATES_KEY = '__observedBannerStates';
const EXPECTED_SEQUENCE = ['lost', 'reconnecting', 'recovered', ONLINE_STATE];
const PARAGRAPHS = ['Paragraph owned by ana.', 'Paragraph owned by bruno.'];
const ANA_PARAGRAPH = 'owned by ana';
const OFFLINE_MARKER = ' <ANA-OFFLINE>';
const RELOADED_MARKER = ' <ANA-RELOADED>';

let origin: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  origin = await startRestartableStack();
});

test.afterEach(async () => {
  await ensureServerRunning();
});

test.afterAll(async () => {
  await stopRestartableStack();
});

function banner(page: Page) {
  return page.getByTestId(BANNER_TEST_ID);
}

async function openSharedDocument(browser: Browser) {
  const owner = await signedInContext({ browser, user: ana!, origin });
  const reader = await signedInContext({ browser, user: bruno!, origin });
  const documentId = await uploadSeed({ page: owner.page, paragraphs: PARAGRAPHS });
  await shareAndAccept({ owner: owner.page, member: reader.page, documentId, role: ShareLinkRole.Edit });
  return { owner, reader, documentId };
}

async function observeBannerStates(page: Page): Promise<void> {
  await page.evaluate(
    ({ bannerTestId, stateAttribute, onlineState, storageKey }) => {
      const states: string[] = [];
      const win = window as unknown as Record<string, string[]>;
      win[storageKey] = states;
      function record(): void {
        const element = document.querySelector(`[data-testid="${bannerTestId}"]`);
        const current = element ? element.getAttribute(stateAttribute)! : onlineState;
        if (states[states.length - 1] !== current) states.push(current);
      }
      record();
      new MutationObserver(record).observe(document.body, { subtree: true, childList: true, attributes: true });
    },
    { bannerTestId: BANNER_TEST_ID, stateAttribute: STATE_ATTRIBUTE, onlineState: ONLINE_STATE, storageKey: OBSERVED_STATES_KEY },
  );
}

function readObservedStates(page: Page): Promise<string[]> {
  return page.evaluate((storageKey) => (window as unknown as Record<string, string[]>)[storageKey]!, OBSERVED_STATES_KEY);
}

async function expectBannerFits(page: Page): Promise<void> {
  const layout = await page.evaluate(
    ({ bannerTestId }) => {
      const element = document.querySelector(`[data-testid="${bannerTestId}"]`)!;
      const reload = element.querySelector('button');
      const reloadBox = reload ? reload.getBoundingClientRect() : null;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        viewportWidth: window.innerWidth,
        bannerHeight: element.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(element).lineHeight),
        reload: reloadBox ? { left: reloadBox.left, right: reloadBox.right } : null,
      };
    },
    { bannerTestId: BANNER_TEST_ID },
  );
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.bannerHeight).toBeLessThanOrEqual(layout.lineHeight * MAX_BANNER_LINES);
  const isFailed = (await banner(page).getAttribute(STATE_ATTRIBUTE)) === 'failed';
  if (!isFailed) return;
  expect(layout.reload).not.toBeNull();
  expect(layout.reload!.left).toBeGreaterThanOrEqual(0);
  expect(layout.reload!.right).toBeLessThanOrEqual(layout.viewportWidth);
}

async function expectFitsAtEveryWidth(page: Page): Promise<void> {
  for (const width of VIEWPORT_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await expectBannerFits(page);
  }
}

async function signInAgain({ author }: { author: SignedInContext }): Promise<void> {
  const page = await author.context.newPage();
  await page.goto(AppRoute.SignIn);
  await signIn({ page, email: ana!.email, password: DEMO_PASSWORD });
  await expect(page).toHaveURL(AppRoute.Documents);
}

test('the restartable server answers health after a stop and a start', async () => {
  await stopServer();
  await startServer();
  const response = await fetch(`${origin}${SERVER_HEALTH_PATH}`);
  expect(response.status).toBe(200);
});

test('a server restart shows lost, reconnecting, then clears', async ({ browser }) => {
  const { owner } = await openSharedDocument(browser);
  await observeBannerStates(owner.page);
  await stopServer();
  await expect(banner(owner.page)).toHaveAttribute(STATE_ATTRIBUTE, 'lost', { timeout: LOST_TIMEOUT_MS });
  await startServer();
  await expect(banner(owner.page)).toHaveCount(0, { timeout: RECOVERY_TIMEOUT_MS });
  const observed = await readObservedStates(owner.page);
  const firstIndexes = EXPECTED_SEQUENCE.map((state) => observed.indexOf(state));
  expect(firstIndexes).not.toContain(-1);
  expect(firstIndexes).toEqual([...firstIndexes].sort((left, right) => left - right));
});

test('an edit typed while the server is down reaches the other author after reconnect', async ({ browser }) => {
  const { owner, reader, documentId } = await openSharedDocument(browser);
  await stopServer();
  await expect(banner(owner.page)).toHaveAttribute(STATE_ATTRIBUTE, 'lost', { timeout: LOST_TIMEOUT_MS });
  await insertInParagraph({ page: owner.page, paragraphText: ANA_PARAGRAPH, text: OFFLINE_MARKER });
  await startServer();
  const restartedAt = Date.now();
  await expect.poll(() => readEditorText(reader.page), { timeout: CONVERGENCE_TIMEOUT_MS }).toContain(OFFLINE_MARKER);
  await expect
    .poll(async () => (await readEvents({ page: reader.page, documentId })).find((event) => event.inserted.includes(OFFLINE_MARKER)), {
      timeout: CONVERGENCE_TIMEOUT_MS,
    })
    .toBeDefined();
  const events = await readEvents({ page: reader.page, documentId });
  const markerEvent = events.find((event) => event.inserted.includes(OFFLINE_MARKER))!;
  expect(markerEvent.serverTime).toBeGreaterThanOrEqual(restartedAt);
});

test('the session cookie removed shows failed, an inert editor and a working Reload', async ({ browser }) => {
  const { owner } = await openSharedDocument(browser);
  await owner.context.clearCookies();
  await stopServer();
  await expect(banner(owner.page)).toHaveAttribute(STATE_ATTRIBUTE, 'lost', { timeout: LOST_TIMEOUT_MS });
  await startServer();
  await expect(banner(owner.page)).toHaveAttribute(STATE_ATTRIBUTE, 'failed', { timeout: FAILED_TIMEOUT_MS });
  await expect(owner.page.getByRole('alert').filter({ has: owner.page.getByRole('button', { name: 'Reload' }) })).toBeVisible();
  await expect(owner.page.getByTestId(EDITOR_TEST_ID)).toHaveAttribute('inert', '');
  await signInAgain({ author: owner });
  await owner.page.getByRole('button', { name: 'Reload' }).click();
  await expect(banner(owner.page)).toHaveCount(0);
  await expect(owner.page.getByTestId(EDITOR_TEST_ID)).not.toHaveAttribute('inert');
  await insertInParagraph({ page: owner.page, paragraphText: ANA_PARAGRAPH, text: RELOADED_MARKER });
  await expect.poll(() => readEditorText(owner.page)).toContain(RELOADED_MARKER);
});

test('the banner reads well at eight widths', async ({ browser }) => {
  test.setTimeout(WIDTH_TEST_TIMEOUT_MS);
  const { owner } = await openSharedDocument(browser);
  await stopServer();
  await expect(banner(owner.page)).toBeVisible({ timeout: LOST_TIMEOUT_MS });
  await expectFitsAtEveryWidth(owner.page);
  await owner.context.clearCookies();
  await startServer();
  await expect(banner(owner.page)).toHaveAttribute(STATE_ATTRIBUTE, 'failed', { timeout: FAILED_TIMEOUT_MS });
  await expectFitsAtEveryWidth(owner.page);
});
