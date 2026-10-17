import type { Browser, Page } from '@playwright/test';
import {
  AppRoute,
  ConnectionState,
  DEMO_USERS,
  MEMBERS_REFRESH_MS,
  RECOVERED_NOTICE_MS,
  SECOND_MS,
  ShareLinkRole,
} from '../libs/types/src';
import { insertInParagraph, readEditorText, readEvents, shareAndAccept, uploadSeed } from './editor';
import { SIGN_IN_LABEL } from '../apps/web/src/features/editor/connection-copy';
import { DEMO_PASSWORD, expect, signedInContext, signIn, test } from './fixtures';
import { ensureServerRunning, startRestartableStack, startServer, stopRestartableStack, stopServer } from './restartable-stack';
import { SERVER_HEALTH_PATH } from './stack';

const [ana, bruno] = DEMO_USERS;
const PROVIDER_RETRY_CAP_MS = 30 * SECOND_MS;
const LOST_TIMEOUT_MS = PROVIDER_RETRY_CAP_MS;
const RECOVERY_TIMEOUT_MS = PROVIDER_RETRY_CAP_MS + MEMBERS_REFRESH_MS + RECOVERED_NOTICE_MS + 10 * SECOND_MS;
const FAILED_TIMEOUT_MS = 2 * PROVIDER_RETRY_CAP_MS;
const CONVERGENCE_TIMEOUT_MS = 2 * PROVIDER_RETRY_CAP_MS;
const WIDTH_TEST_TIMEOUT_MS = 240 * SECOND_MS;
const VIEWPORT_HEIGHT = 900;
const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1280, 1536, 1920, 2560];
const MAX_PHONE_TEXT_LINES = 3;
const MAX_PHONE_FAILED_TEXT_LINES = 5;
const PHONE_MAX_WIDTH = 375;
const BANNER_TEST_ID = 'connection-banner';
const EDITOR_TEST_ID = 'document-editor';
const STATE_ATTRIBUTE = 'data-state';
const DISCONNECTED_STATES = new RegExp(`^(${ConnectionState.Lost}|${ConnectionState.Reconnecting})$`);
const OBSERVED_STATES_KEY = '__observedBannerStates';
const REQUIRED_SEQUENCE = [ConnectionState.Reconnecting, ConnectionState.Recovered];
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
    { bannerTestId: BANNER_TEST_ID, stateAttribute: STATE_ATTRIBUTE, onlineState: ConnectionState.Online, storageKey: OBSERVED_STATES_KEY },
  );
}

function readObservedStates(page: Page): Promise<string[]> {
  return page.evaluate((storageKey) => (window as unknown as Record<string, string[]>)[storageKey]!, OBSERVED_STATES_KEY);
}

async function measureBannerProblems(page: Page): Promise<string[]> {
  const layout = await page.evaluate(
    ({ bannerTestId }) => {
      const element = document.querySelector(`[data-testid="${bannerTestId}"]`)!;
      const textBlock = element.querySelector('div')!;
      const reload = element.querySelector('button');
      const reloadBox = reload ? reload.getBoundingClientRect() : null;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        viewportWidth: window.innerWidth,
        textLines: textBlock.getBoundingClientRect().height / parseFloat(getComputedStyle(textBlock).lineHeight),
        reload: reloadBox ? { left: reloadBox.left, right: reloadBox.right } : null,
      };
    },
    { bannerTestId: BANNER_TEST_ID },
  );
  const state = await banner(page).getAttribute(STATE_ATTRIBUTE);
  const isFailed = state === ConnectionState.Failed;
  const isPhone = layout.viewportWidth <= PHONE_MAX_WIDTH;
  const maxTextLines = isFailed ? MAX_PHONE_FAILED_TEXT_LINES : MAX_PHONE_TEXT_LINES;
  const isReloadOutside = isFailed && (layout.reload === null || layout.reload.left < 0 || layout.reload.right > layout.viewportWidth);
  const problems = [
    layout.scrollWidth > layout.clientWidth && 'the page scrolls horizontally',
    isPhone && layout.textLines > maxTextLines && `the text takes ${layout.textLines} lines, more than ${maxTextLines}`,
    isReloadOutside && 'Reload is not fully inside the viewport',
  ];
  return problems
    .filter((problem): problem is string => typeof problem === 'string')
    .map((problem) => `${state} at ${layout.viewportWidth}px: ${problem}`);
}

async function measureAtEveryWidth(page: Page): Promise<string[]> {
  const problems: string[] = [];
  for (const width of VIEWPORT_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    problems.push(...(await measureBannerProblems(page)));
  }
  return problems;
}

test('the restartable server answers health after a stop and a start', async () => {
  await stopServer();
  await startServer();
  const response = await fetch(`${origin}${SERVER_HEALTH_PATH}`);
  expect(response.status).toBe(200);
});

test('a server restart shows reconnecting, recovered, then clears', async ({ browser }) => {
  const { owner } = await openSharedDocument(browser);
  await observeBannerStates(owner.page);
  await stopServer();
  await expect(banner(owner.page)).toHaveAttribute(STATE_ATTRIBUTE, DISCONNECTED_STATES, { timeout: LOST_TIMEOUT_MS });
  await startServer();
  await expect(banner(owner.page)).toHaveCount(0, { timeout: RECOVERY_TIMEOUT_MS });
  const observed = await readObservedStates(owner.page);
  const firstIndexes = REQUIRED_SEQUENCE.map((state) => observed.indexOf(state));
  expect(firstIndexes).not.toContain(-1);
  expect(firstIndexes).toEqual([...firstIndexes].sort((left, right) => left - right));
  const lostIndex = observed.indexOf(ConnectionState.Lost);
  const isLostAfterReconnecting = lostIndex > firstIndexes[0]!;
  expect(isLostAfterReconnecting).toBe(false);
});

test('an edit typed while the server is down reaches the other author after reconnect', async ({ browser }) => {
  const { owner, reader, documentId } = await openSharedDocument(browser);
  await stopServer();
  await expect(banner(owner.page)).toHaveAttribute(STATE_ATTRIBUTE, DISCONNECTED_STATES, { timeout: LOST_TIMEOUT_MS });
  await insertInParagraph({ page: owner.page, paragraphText: ANA_PARAGRAPH, text: OFFLINE_MARKER });
  const restartingAt = Date.now();
  await startServer();
  await expect.poll(() => readEditorText(reader.page), { timeout: CONVERGENCE_TIMEOUT_MS }).toContain(OFFLINE_MARKER);
  await expect
    .poll(async () => (await readEvents({ page: reader.page, documentId })).find((event) => event.inserted.includes(OFFLINE_MARKER)), {
      timeout: CONVERGENCE_TIMEOUT_MS,
    })
    .toBeDefined();
  const events = await readEvents({ page: reader.page, documentId });
  const markerEvent = events.find((event) => event.inserted.includes(OFFLINE_MARKER))!;
  expect(markerEvent.serverTime).toBeGreaterThanOrEqual(restartingAt);
});

test('the session cookie removed shows failed, an inert editor and Sign in that returns to the document', async ({ browser }) => {
  const { owner } = await openSharedDocument(browser);
  const documentPath = new URL(owner.page.url()).pathname;
  await owner.context.clearCookies();
  await stopServer();
  await startServer();
  await expect(banner(owner.page)).toHaveAttribute(STATE_ATTRIBUTE, ConnectionState.Failed, { timeout: FAILED_TIMEOUT_MS });
  await expect(owner.page.getByRole('alert').filter({ has: owner.page.getByRole('button', { name: SIGN_IN_LABEL }) })).toBeVisible();
  await expect(owner.page.getByTestId(EDITOR_TEST_ID)).toHaveAttribute('inert', '');
  await owner.page.getByRole('button', { name: SIGN_IN_LABEL }).click();
  await expect(owner.page).toHaveURL(new RegExp(`${AppRoute.SignIn}\\?next=`));
  await signIn({ page: owner.page, email: ana!.email, password: DEMO_PASSWORD });
  await expect(owner.page).toHaveURL(new RegExp(`${documentPath}$`));
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
  const disconnectedProblems = await measureAtEveryWidth(owner.page);
  await owner.context.clearCookies();
  await startServer();
  await expect(banner(owner.page)).toHaveAttribute(STATE_ATTRIBUTE, ConnectionState.Failed, { timeout: FAILED_TIMEOUT_MS });
  const failedProblems = await measureAtEveryWidth(owner.page);
  expect([...disconnectedProblems, ...failedProblems]).toEqual([]);
});
