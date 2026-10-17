import type { CreatedInvite, InviteSummary } from '@superdoc-history/types';
import type { AuthDatabase } from '../database/connection';

export enum RevokeOutcome {
  Revoked = 'revoked',
  NotFound = 'not-found',
  AlreadyAccepted = 'already-accepted',
}

export class InvitesRepository {
  constructor(_options: { database: AuthDatabase; appOrigin: string; now: () => number }) {}

  hasAnyUser(): boolean {
    throw new Error('InvitesRepository.hasAnyUser is not implemented');
  }

  create(_options: { createdBy: string }): CreatedInvite {
    throw new Error('InvitesRepository.create is not implemented');
  }

  resolvePending(_token: string): { id: string } | null {
    throw new Error('InvitesRepository.resolvePending is not implemented');
  }

  accept(_options: { id: string; userId: string }): boolean {
    throw new Error('InvitesRepository.accept is not implemented');
  }

  revoke(_id: string): RevokeOutcome {
    throw new Error('InvitesRepository.revoke is not implemented');
  }

  list(): InviteSummary[] {
    throw new Error('InvitesRepository.list is not implemented');
  }
}
