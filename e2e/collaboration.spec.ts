import Database from 'better-sqlite3';
import { join } from 'node:path';
import { DEMO_USERS, ShareLinkRole } from '../libs/types/src';
import { EDIT_REJECTED_MESSAGE, EDITOR_FAILED_MESSAGE, memberLabel } from '../apps/web/src/features/editor/editor-copy';
import {
  editorText,
  expectEveryCharacterAccounted,
  insertedBy,
  readEditorText,
  readEvents,
  shareAndAccept,
  topBar,
  typeInParagraph,
  uploadSeed,
} from './editor';
import { expect, signedInContext, test } from './fixtures';

const HISTORY_DATABASE_FILE = 'history.sqlite';
const DECLARED_SOURCE = 'declared';
const MARKERS = [' <ANA-T2>', ' <BRUNO-T2>'];
const CONVERGENCE_TIMEOUT_MS = 60_000;
const ATTRIBUTION_TIMEOUT_MS = 30_000;
const SLOW_TEXT = 'typed slowly while the paragraph disappears';
const KEYSTROKE_DELAY_MS = 120;
const REPLACEMENT_TEXT = 'Bruno starts over.';
const RECOVERY_TEXT = ' Ana is back.';
const PROBE_KEY = 'x';
const STATUS_PROBE_TIMEOUT_MS = 1_000;

async function twoAuthorsType(browser: Parameters<typeof signedInContext>[0]['browser']) {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: ['Paragraph owned by ana.', 'Paragraph owned by bruno.'] });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  const initialLength = (await readEditorText(ana.page)).length;
  await Promise.all([
    typeInParagraph({ page: ana.page, paragraphText: 'owned by ana', text: MARKERS[0]! }),
    typeInParagraph({ page: bruno.page, paragraphText: 'owned by bruno', text: MARKERS[1]! }),
  ]);
  return { ana, bruno, documentId, initialLength, finalLength: initialLength + MARKERS.join('').length };
}

test('two authors converge and each marker is attributed to its author', async ({ browser }) => {
  const { ana, bruno, documentId, initialLength, finalLength } = await twoAuthorsType(browser);
  await expect
    .poll(
      async () => {
        const [anaText, brunoText] = await Promise.all([readEditorText(ana.page), readEditorText(bruno.page)]);
        return anaText === brunoText && anaText.length === finalLength;
      },
      { timeout: CONVERGENCE_TIMEOUT_MS },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const events = await readEvents({ page: ana.page, documentId });
        return [insertedBy({ events, userId: ana.userId }), insertedBy({ events, userId: bruno.userId })];
      },
      { timeout: ATTRIBUTION_TIMEOUT_MS },
    )
    .toEqual(MARKERS);
  const events = await readEvents({ page: ana.page, documentId });
  expectEveryCharacterAccounted({ events: events.filter((event) => !event.imported), initialLength, finalLength });
});

test('identities are declared from awareness', async ({ browser }) => {
  const { ana, bruno, documentId } = await twoAuthorsType(browser);
  await expect
    .poll(async () => (await readEvents({ page: ana.page, documentId })).length, { timeout: ATTRIBUTION_TIMEOUT_MS })
    .toBeGreaterThan(0);
  const history = new Database(join(process.env.E2E_DATABASE_DIR!, HISTORY_DATABASE_FILE), { readonly: true });
  const rows = history
    .prepare('SELECT user_id, source FROM client_identities WHERE document_name = ? AND user_id IN (?, ?)')
    .all(documentId, ana.userId, bruno.userId) as { user_id: string; source: string }[];
  history.close();
  expect(new Set(rows.map((row) => row.user_id))).toEqual(new Set([ana.userId, bruno.userId]));
  expect(rows.every((row) => row.source === DECLARED_SOURCE)).toBe(true);
});

test('a member shows in the top bar while in the document and leaves it when the tab closes', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: ['Paragraph owned by ana.'] });
  const brunoAvatar = topBar(ana.page).getByRole('button', { name: memberLabel(DEMO_USERS[1]!.name) });
  await expect(brunoAvatar).toHaveCount(0);
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await expect(brunoAvatar).toBeVisible({ timeout: ATTRIBUTION_TIMEOUT_MS });
  await bruno.page.close();
  await expect(brunoAvatar).toHaveCount(0, { timeout: ATTRIBUTION_TIMEOUT_MS });
});

test('an edit rejected under a concurrent delete does not stop the editor', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: ['Paragraph owned by ana.', 'Paragraph owned by bruno.'] });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  const initialLength = (await readEditorText(ana.page)).length;
  await editorText(ana.page).filter({ hasText: 'owned by ana' }).first().click();
  await ana.page.keyboard.press('Home');
  const typing = ana.page.keyboard.type(SLOW_TEXT, { delay: KEYSTROKE_DELAY_MS });
  await editorText(bruno.page).filter({ hasText: 'owned by ana' }).first().click();
  await bruno.page.keyboard.press('ControlOrMeta+a');
  await bruno.page.keyboard.press('Delete');
  await typing;
  const rejectedStatus = ana.page.getByRole('status').filter({ hasText: EDIT_REJECTED_MESSAGE });
  await expect(async () => {
    await ana.page.keyboard.type(PROBE_KEY);
    await expect(rejectedStatus).toBeVisible({ timeout: STATUS_PROBE_TIMEOUT_MS });
  }).toPass({ timeout: CONVERGENCE_TIMEOUT_MS });
  await expect(ana.page.getByText(EDITOR_FAILED_MESSAGE)).toHaveCount(0);
  await bruno.page.keyboard.type(REPLACEMENT_TEXT, { delay: KEYSTROKE_DELAY_MS });
  await expect.poll(() => readEditorText(ana.page), { timeout: CONVERGENCE_TIMEOUT_MS }).toContain(REPLACEMENT_TEXT);
  await editorText(ana.page).filter({ hasText: REPLACEMENT_TEXT }).first().click();
  await expect(rejectedStatus).toHaveCount(0);
  await typeInParagraph({ page: ana.page, paragraphText: REPLACEMENT_TEXT, text: RECOVERY_TEXT });
  await expect
    .poll(
      async () => {
        const [anaText, brunoText] = await Promise.all([readEditorText(ana.page), readEditorText(bruno.page)]);
        return anaText === brunoText && anaText.includes(RECOVERY_TEXT);
      },
      { timeout: CONVERGENCE_TIMEOUT_MS },
    )
    .toBe(true);
  await expect(ana.page.getByText(EDITOR_FAILED_MESSAGE)).toHaveCount(0);
  const finalLength = (await readEditorText(ana.page)).length;
  await expect(async () => {
    const events = await readEvents({ page: ana.page, documentId });
    expectEveryCharacterAccounted({ events: events.filter((event) => !event.imported), initialLength, finalLength });
  }).toPass({ timeout: ATTRIBUTION_TIMEOUT_MS });
});
