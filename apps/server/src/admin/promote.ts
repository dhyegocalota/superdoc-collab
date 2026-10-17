import type { AuthDatabase } from '../database/connection';

export enum PromoteOutcome {
  Promoted = 'promoted',
  NotFound = 'not-found',
}

export function promoteByEmail(_options: { database: AuthDatabase; email: string }): PromoteOutcome {
  throw new Error('promoteByEmail is not implemented');
}
