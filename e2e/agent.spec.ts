import {
  AppRoute,
  AgentActionKind,
  DOCX_MIME_TYPE,
  AgentTool,
  agentAuthorName,
  ClientActor,
  DEMO_USERS,
  HttpStatus,
  ShareLinkRole,
} from '../libs/types/src';
import {
  callTool,
  exportDocxThroughAgent,
  approveConsentPage,
  beginAuthorization,
  connectAiClient,
  openConnectedApps,
  readTimelineThroughAgent,
  registerClient,
  replaceTextThroughAgent,
  rejectedStatus,
  rotateShareLinkThroughAgent,
  revokeConnectedApp,
  toolJson,
  trackedChangeCards,
} from './agent';
import { insertInParagraph, uploadSeed } from './editor';
import { DEMO_PASSWORD, expect, signedInContext, signIn, test } from './fixtures';
import { agentActionLabel, AI_BADGE_LABEL } from '../apps/web/src/features/timeline/timeline-copy';
import {
  ANA_TEXT,
  BANDS_TIMEOUT_MS,
  BUDGET,
  BUDGET_PARAGRAPH,
  HIRING,
  HIRING_PARAGRAPH,
  readTimeline,
  waitForBands,
  waitForSettledTimeline,
} from './timeline';

const ANA = DEMO_USERS[0]!;
const AGENT_LAYER_SELECTOR = `[data-actor="${ClientActor.Agent}"]`;
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const HIRING_FIND = 'two people';
const HIRING_REPLACE = 'three people';

test('an AI client connects, edits in tracked mode and is revoked', async ({ browser, request }) => {
  const ana = await signedInContext({ browser, user: ANA });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  const connection = await connectAiClient({ page: await ana.context.newPage(), request });

  const timeline = await readTimelineThroughAgent({ connection, documentId });
  expect(timeline.agentActions).toEqual([]);
  toolJson(await replaceTextThroughAgent({ connection, documentId, find: HIRING_FIND, replace: HIRING_REPLACE }));

  await expect(trackedChangeCards(ana.page).filter({ hasText: agentAuthorName(ANA.name) })).toBeVisible({ timeout: BANDS_TIMEOUT_MS });
  await waitForBands({ page: ana.page, names: [HIRING] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await expect(ana.page.locator(AGENT_LAYER_SELECTOR).first()).toBeVisible();
  await expect(ana.page.locator(`li[title="${agentAuthorName(ANA.name)}"]`).getByLabel(AI_BADGE_LABEL)).toBeVisible();

  const connectedApps = await ana.context.newPage();
  await openConnectedApps({ page: connectedApps, clientName: connection.clientName });
  await revokeConnectedApp({ page: connectedApps, clientName: connection.clientName });
  const revokedCall = callTool({ connection, tool: AgentTool.GetTimeline, args: { documentId } });
  expect(await rejectedStatus(revokedCall)).toBe(HttpStatus.Unauthorized);
});

test('a share link rotated by the AI leaves a mark and reveals no link', async ({ browser, request }) => {
  const ana = await signedInContext({ browser, user: ANA });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await insertInParagraph({ page: ana.page, paragraphText: BUDGET_PARAGRAPH.slice(0, 7), text: ANA_TEXT });
  await waitForBands({ page: ana.page, names: [BUDGET] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  const connection = await connectAiClient({ page: await ana.context.newPage(), request });

  const rotation = await rotateShareLinkThroughAgent({ connection, documentId, role: ShareLinkRole.Read });
  expect(JSON.stringify(rotation)).not.toContain(AppRoute.Share.replace(':token', ''));

  await expect
    .poll(async () => (await readTimeline({ page: ana.page, documentId })).agentActions.map((action) => action.kind))
    .toEqual([AgentActionKind.ShareLinkRotated]);
  const label = agentActionLabel({ name: agentAuthorName(ANA.name), kind: AgentActionKind.ShareLinkRotated });
  const mark = ana.page.getByRole('img', { name: label });
  await expect(mark).toBeVisible({ timeout: BANDS_TIMEOUT_MS });
  await mark.hover();
  await expect(ana.page.getByRole('tooltip')).toHaveText(label);
});

test('a document exported by the AI is a DOCX and leaves a mark', async ({ browser, request }) => {
  const ana = await signedInContext({ browser, user: ANA });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await insertInParagraph({ page: ana.page, paragraphText: BUDGET_PARAGRAPH.slice(0, 7), text: ANA_TEXT });
  await waitForBands({ page: ana.page, names: [BUDGET] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  const connection = await connectAiClient({ page: await ana.context.newPage(), request });

  const { mimeType, bytes } = await exportDocxThroughAgent({ connection, documentId });

  expect(mimeType).toBe(DOCX_MIME_TYPE);
  expect(bytes.subarray(0, ZIP_SIGNATURE.length)).toEqual(ZIP_SIGNATURE);
  const label = agentActionLabel({ name: agentAuthorName(ANA.name), kind: AgentActionKind.DocumentExported });
  await expect(ana.page.getByRole('img', { name: label })).toBeVisible({ timeout: BANDS_TIMEOUT_MS });
});

test('a signed-out authorize walk reaches consent after sign-in and Approve reaches the redirect with a code', async ({
  page,
  request,
}) => {
  await page.goto(AppRoute.SignIn);
  const { origin } = new URL(page.url());
  const client = await registerClient({ request, origin });
  const { state, callback } = await beginAuthorization({ page, client, origin });
  await expect(page).toHaveURL(new RegExp(`${AppRoute.SignIn}\\?`));
  await signIn({ page, email: ANA.email, password: DEMO_PASSWORD });
  const code = await approveConsentPage({ page, client, state, callback });
  expect(code).not.toBe('');
});
