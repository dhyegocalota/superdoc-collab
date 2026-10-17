import type Database from 'better-sqlite3';
import type { AgentActionKind, AgentActionMark } from '@superdoc-history/types';

export class AgentActionsLog {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  record(_action: { documentName: string; userId: string; kind: AgentActionKind; createdAt: number }): void {
    throw new Error('AgentActionsLog.record is not implemented');
  }

  list(_documentName: string): AgentActionMark[] {
    throw new Error('AgentActionsLog.list is not implemented');
  }
}
