import type Database from 'better-sqlite3';
import type { AgentActionKind, AgentActionMark } from '@superdoc-collab/types';

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

  span(documentName: string): { first: number; last: number } | null {
    const row = this.database
      .prepare('SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM agent_actions WHERE document_name = ?')
      .get(documentName) as { first: number | null; last: number | null };
    if (row.first === null || row.last === null) return null;
    return { first: row.first, last: row.last };
  }

  list({ documentName, from, until }: { documentName: string; from: number; until: number }): AgentActionMark[] {
    const rows = this.database
      .prepare(
        'SELECT user_id, kind, created_at FROM agent_actions WHERE document_name = ? AND created_at >= ? AND created_at < ? ORDER BY created_at, id',
      )
      .all(documentName, from, until) as AgentActionRow[];
    return rows.map((row) => ({ userId: row.user_id, kind: row.kind, createdAt: row.created_at }));
  }
}
