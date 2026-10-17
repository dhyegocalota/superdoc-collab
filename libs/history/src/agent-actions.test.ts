import { AgentActionKind } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { AgentActionsLog } from './agent-actions';
import { MigrationSet } from './migrations';
import { openTestDatabase } from './testing';

const DOCUMENT = 'document-1';
const OTHER_DOCUMENT = 'other';

test('recorded actions come back in time order', () => {
  const log = new AgentActionsLog(openTestDatabase({ set: MigrationSet.History }));
  log.record({ documentName: DOCUMENT, userId: 'ana', kind: AgentActionKind.DocumentExported, createdAt: 30 });
  log.record({ documentName: DOCUMENT, userId: 'bruno', kind: AgentActionKind.ShareLinkRevealed, createdAt: 10 });
  log.record({ documentName: OTHER_DOCUMENT, userId: 'ana', kind: AgentActionKind.ShareLinkRotated, createdAt: 20 });
  expect(log.list(DOCUMENT)).toEqual([
    { userId: 'bruno', kind: AgentActionKind.ShareLinkRevealed, createdAt: 10 },
    { userId: 'ana', kind: AgentActionKind.DocumentExported, createdAt: 30 },
  ]);
});

test('a document with no agent actions lists none', () => {
  const log = new AgentActionsLog(openTestDatabase({ set: MigrationSet.History }));
  expect(log.list(DOCUMENT)).toEqual([]);
});
