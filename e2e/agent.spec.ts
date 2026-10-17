import { AgentTool, agentAuthorName, ClientActor, DEMO_USERS, HttpStatus } from '../libs/types/src';
import {
  callTool,
  connectAiClient,
  openConnectedApps,
  readTimelineThroughAgent,
  replaceTextThroughAgent,
  rejectedStatus,
  revokeConnectedApp,
  toolJson,
  trackedChangeCards,
} from './agent';
import { uploadSeed } from './editor';
import { expect, signedInContext, test } from './fixtures';
import { BANDS_TIMEOUT_MS, BUDGET_PARAGRAPH, HIRING, HIRING_PARAGRAPH, waitForBands, waitForSettledTimeline } from './timeline';

const ANA = DEMO_USERS[0]!;
const AGENT_LAYER_SELECTOR = `[data-actor="${ClientActor.Agent}"]`;
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

  const connectedApps = await ana.context.newPage();
  await openConnectedApps({ page: connectedApps, clientName: connection.clientName });
  await revokeConnectedApp({ page: connectedApps, clientName: connection.clientName });
  const revokedCall = callTool({ connection, tool: AgentTool.GetTimeline, args: { documentId } });
  expect(await rejectedStatus(revokedCall)).toBe(HttpStatus.Unauthorized);
});
