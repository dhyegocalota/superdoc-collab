import Database from 'better-sqlite3';
import { join } from 'node:path';
import { DEMO_USERS, ShareLinkRole } from '../libs/types/src';
import { expectEveryCharacterAccounted, insertedBy, readEditorText, readEvents, shareAndAccept, typeInParagraph, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';

const HISTORY_DATABASE_FILE = 'history.sqlite';
const DECLARED_SOURCE = 'declared';
const MARKERS = [' <ANA-T2>', ' <BRUNO-T2>'];
const CONVERGENCE_TIMEOUT_MS = 60_000;
const ATTRIBUTION_TIMEOUT_MS = 30_000;

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
    .poll(async () => {
      const [anaText, brunoText] = await Promise.all([readEditorText(ana.page), readEditorText(bruno.page)]);
      return anaText === brunoText && anaText.length === finalLength;
    }, { timeout: CONVERGENCE_TIMEOUT_MS })
    .toBe(true);
  await expect
    .poll(async () => {
      const events = await readEvents({ page: ana.page, documentId });
      return [insertedBy({ events, userId: ana.userId }), insertedBy({ events, userId: bruno.userId })];
    }, { timeout: ATTRIBUTION_TIMEOUT_MS })
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
