import { AgentActionKind } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { AgentActionsLog } from './agent-actions';
import { MigrationSet } from './migrations';
import { openTestDatabase } from './testing';

const DOCUMENT = 'document-1';
const OTHER_DOCUMENT = 'other';

test('recorded actions come back in time order', () => {
  const log = new AgentActionsLog(openTestDatabase({ set: MigrationSet.History }));
  log.record({ documentName: DOCUMENT, userId: 'ana', kind: AgentActionKind.DocumentExported, createdAt: 30 });
  log.record({ documentName: DOCUMENT, userId: 'bruno', kind: AgentActionKind.ShareLinkRotated, createdAt: 10 });
  log.record({ documentName: OTHER_DOCUMENT, userId: 'ana', kind: AgentActionKind.ShareLinkRotated, createdAt: 20 });
  expect(log.list({ documentName: DOCUMENT, from: 0, until: 100 })).toEqual([
    { userId: 'bruno', kind: AgentActionKind.ShareLinkRotated, createdAt: 10 },
    { userId: 'ana', kind: AgentActionKind.DocumentExported, createdAt: 30 },
  ]);
});

test('a document with no agent actions lists none', () => {
  const log = new AgentActionsLog(openTestDatabase({ set: MigrationSet.History }));
  expect(log.list({ documentName: DOCUMENT, from: 0, until: 100 })).toEqual([]);
});

test('list returns only the actions from the start up to, excluding, the end', () => {
  const log = new AgentActionsLog(openTestDatabase({ set: MigrationSet.History }));
  [5, 10, 20, 30].forEach((createdAt) =>
    log.record({ documentName: DOCUMENT, userId: 'ana', kind: AgentActionKind.DocumentExported, createdAt }),
  );
  expect(log.list({ documentName: DOCUMENT, from: 10, until: 30 }).map((mark) => mark.createdAt)).toEqual([10, 20]);
});

test('span is the first and last action time of one document, or null', () => {
  const log = new AgentActionsLog(openTestDatabase({ set: MigrationSet.History }));
  expect(log.span(DOCUMENT)).toBeNull();
  [20, 5, 30].forEach((createdAt) =>
    log.record({ documentName: DOCUMENT, userId: 'ana', kind: AgentActionKind.DocumentExported, createdAt }),
  );
  log.record({ documentName: OTHER_DOCUMENT, userId: 'ana', kind: AgentActionKind.DocumentExported, createdAt: 99 });
  expect(log.span(DOCUMENT)).toEqual({ first: 5, last: 30 });
});
