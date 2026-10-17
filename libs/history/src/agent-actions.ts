import type Database from 'better-sqlite3';
import type { AgentActionKind, AgentActionMark } from '@superdoc-history/types';

type AgentActionRow = {
  user_id: string;
  kind: AgentActionKind;
  created_at: number;
};

export class AgentActionsLog {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  record({
    documentName,
    userId,
    kind,
    createdAt,
  }: {
    documentName: string;
    userId: string;
    kind: AgentActionKind;
    createdAt: number;
  }): void {
    this.database
      .prepare('INSERT INTO agent_actions (document_name, user_id, kind, created_at) VALUES (?, ?, ?, ?)')
      .run(documentName, userId, kind, createdAt);
  }

  span(_documentName: string): { first: number; last: number } | null {
    throw new Error('AgentActionsLog.span is not implemented');
  }

  list({ documentName, from, until }: { documentName: string; from: number; until: number }): AgentActionMark[] {
    const rows = this.database
      .prepare('SELECT user_id, kind, created_at FROM agent_actions WHERE document_name = ? ORDER BY created_at, id')
      .all(documentName) as AgentActionRow[];
    return rows.map((row) => ({ userId: row.user_id, kind: row.kind, createdAt: row.created_at }));
  }
}
