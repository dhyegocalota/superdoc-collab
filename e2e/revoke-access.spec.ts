import { randomUUID } from 'node:crypto';
import { AppRoute, DEMO_USERS, DOCUMENT_UNAVAILABLE_MESSAGE, ShareLinkRole } from '../libs/types/src';
import { shareAndAccept, uploadSeed } from './editor';
import { PEOPLE_WITH_ACCESS_LABEL, removeMemberLabel, SHARE_LABEL } from '../apps/web/src/features/editor/editor-copy';
import { expect, signedInContext, test } from './fixtures';

const PARAGRAPHS = ['Paragraph owned by ana.'];
const REVOKED_TIMEOUT_MS = 20_000;
const BRUNO_AVATAR_NAME = /^Bruno/;

test('the owner removes a reader who loses the document at once', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const title = `revoke-${randomUUID().slice(0, 8)}`;
  const documentId = await uploadSeed({ page: ana.page, paragraphs: PARAGRAPHS, fileName: `${title}.docx` });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Read });
  await expect(ana.page.getByRole('button', { name: BRUNO_AVATAR_NAME })).toBeVisible({ timeout: REVOKED_TIMEOUT_MS });

  await ana.page.getByRole('button', { name: SHARE_LABEL }).click();
  const people = ana.page.getByRole('group', { name: PEOPLE_WITH_ACCESS_LABEL });
  await expect(people.getByRole('button', { name: removeMemberLabel('Ana') })).toHaveCount(0);
  await people.getByRole('button', { name: removeMemberLabel('Bruno') }).click();
  await expect(people.getByText('Bruno')).toHaveCount(0);
  await ana.page.keyboard.press('Escape');
  await expect(ana.page.getByRole('button', { name: BRUNO_AVATAR_NAME })).toHaveCount(0);

  await expect(bruno.page.getByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeVisible({ timeout: REVOKED_TIMEOUT_MS });
  await bruno.page.goto(AppRoute.Documents);
  await expect(bruno.page.getByText(title)).toHaveCount(0);
});
