import { DEMO_USERS, DOCX_MIME_TYPE, ShareLinkRole } from '../libs/types/src';
import { FILE_INPUT_LABEL } from '../apps/web/src/features/documents/documents-copy';
import { acceptShareLink, editorText, openDocumentFileInput } from './editor';
import { buildLargeDocx } from './fixtures/large-docx';
import { expect, signedInContext, test } from './fixtures';
import { RestartablePort, startRestartableStack, stopRestartableStack } from './restartable-stack';
import { awaitStableScrollHeight, median, typeAndMeasure, TYPING_PROBE_SCRIPT } from './typing-latency';

const LARGE_PARAGRAPH = 'Large document paragraph.';
const CLAUSE_PATTERN = /^Clause \d+\./;
const EDITOR_TEST_ID = 'document-editor';
const PREVIEW_TEST_ID = 'local-preview';
const DOCUMENT_URL_PATTERN = /\/documents\/([^/?#]+)/;
const SIX_GIGABYTES_MEGABYTES = '6144';
const START_LETTERS = 'qzxjkvwyfp';
const MIDDLE_LETTERS = 'ypfwvkjxzq';
const START_MEDIAN_BOUND_MS = 1500;
const MIDDLE_MEDIAN_BOUND_MS = 1500;
const LONGEST_TASK_BOUND_MS = 1000;
const TEST_TIMEOUT_MS = 900_000;
const OPEN_TIMEOUT_MS = 600_000;
const PREVIEW_GONE_TIMEOUT_MS = 120_000;
const SETTLE_TIMEOUT_MS = 60_000;
const MIDDLE_CLAUSE_INDEX = 3;
const HALF = 2;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await startRestartableStack({ port: RestartablePort.TypingLatency, overrides: { MEMORY_LIMIT_MEGABYTES: SIX_GIGABYTES_MEGABYTES } });
});

test.afterAll(async () => {
  await stopRestartableStack();
});

test('a keystroke in a 2,000-page document reaches the page in under 1.5 s at the start and in the middle, with no task over 1 s', async ({ browser }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const origin = `http://127.0.0.1:${RestartablePort.TypingLatency}`;
  const uploader = await signedInContext({ browser, user: DEMO_USERS[0]!, origin });
  const typist = await signedInContext({ browser, user: DEMO_USERS[1]!, origin });
  await typist.page.addInitScript(TYPING_PROBE_SCRIPT);
  await uploader.page.goto('/documents');
  await openDocumentFileInput(uploader.page);
  await uploader.page
    .getByLabel(FILE_INPUT_LABEL)
    .setInputFiles({ name: 'large.docx', mimeType: DOCX_MIME_TYPE, buffer: buildLargeDocx(LARGE_PARAGRAPH) });
  await expect(uploader.page).toHaveURL(DOCUMENT_URL_PATTERN);
  const documentId = DOCUMENT_URL_PATTERN.exec(uploader.page.url())![1]!;
  await expect(editorText(uploader.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: OPEN_TIMEOUT_MS });
  await acceptShareLink({ page: typist.page, documentId, role: ShareLinkRole.Edit, owner: uploader.page });
  await expect(editorText(typist.page).filter({ hasText: LARGE_PARAGRAPH }).first()).toBeVisible({ timeout: OPEN_TIMEOUT_MS });
  await expect(typist.page.getByTestId(PREVIEW_TEST_ID)).toHaveCount(0, { timeout: PREVIEW_GONE_TIMEOUT_MS });

  const editor = typist.page.getByTestId(EDITOR_TEST_ID);
  await awaitStableScrollHeight({ page: typist.page });
  await editor.evaluate((node) => (node.scrollTop = 0));
  await editorText(typist.page).first().click();
  await typist.page.keyboard.press('Control+Home');
  const atStart = await typeAndMeasure({ page: typist.page, letters: START_LETTERS });

  await awaitStableScrollHeight({ page: typist.page });
  await editor.evaluate((node, half) => (node.scrollTop = node.scrollHeight / half), HALF);
  const clause = editorText(typist.page).filter({ hasText: CLAUSE_PATTERN }).nth(MIDDLE_CLAUSE_INDEX);
  await clause.waitFor({ timeout: SETTLE_TIMEOUT_MS });
  await clause.click();
  await typist.page.keyboard.press('Home');
  const inMiddle = await typeAndMeasure({ page: typist.page, letters: MIDDLE_LETTERS });

  expect(median(atStart.settledMs)).toBeLessThan(START_MEDIAN_BOUND_MS);
  expect(atStart.longestTaskMs).toBeLessThan(LONGEST_TASK_BOUND_MS);
  expect(median(inMiddle.settledMs)).toBeLessThan(MIDDLE_MEDIAN_BOUND_MS);
  expect(inMiddle.longestTaskMs).toBeLessThan(LONGEST_TASK_BOUND_MS);
});
