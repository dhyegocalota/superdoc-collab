import { DEMO_USERS, ShareLinkRole } from '../libs/types/src';
import { shareAndAccept, typeInParagraph, uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import { BANDS_TIMEOUT_MS, bandNamed } from './timeline';

const BUDGET_PARAGRAPH = 'Budget: the plan costs 10.';
const HIRING_PARAGRAPH = 'Hiring: we add two people.';

test('topics are named for a document opened right after upload without any refresh', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await Promise.all([
    typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: ' More money' }),
    typeInParagraph({ page: bruno.page, paragraphText: 'Hiring:', text: ' A designer' }),
  ]);
  await expect(bandNamed({ page: ana.page, name: 'Budget' })).toBeVisible({ timeout: BANDS_TIMEOUT_MS });
  await expect(bandNamed({ page: ana.page, name: 'Hiring' })).toBeVisible({ timeout: BANDS_TIMEOUT_MS });
});
